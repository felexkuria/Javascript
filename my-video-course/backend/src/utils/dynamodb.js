const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const { DynamoDBClient, UpdateItemCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

class DynamoDBService {
  constructor() {
    this.dynamodb = null;
    this.docClient = null;
    this.isConnected = false;
    this.init();
  }

  init() {
    try {
      // System Clock Check (for signature debugging)
      const now = new Date();
      const year = now.getFullYear();
      if (year > 2025) {
        console.warn(`⚠️  System clock is set to ${year}. This may cause AWS signature mismatches (InvalidSignatureException).`);
      }

      // Configure AWS SDK v3
      const config = {
        region: process.env.AWS_REGION || 'us-east-1'
      };
      
      // Only add credentials if they exist and are NOT commented out in .env
      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && !process.env.AWS_ACCESS_KEY_ID.startsWith('#')) {
        config.credentials = {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        };
      }
      this.dynamodb = new DynamoDBClient(config);
      console.log(`✅ DynamoDB initialized (Region: ${config.region}, Auth: ${config.credentials ? 'Static Keys (' + config.credentials.accessKeyId.substring(0, 5) + '...)' : 'IAM Role / Default Profile'})`);
      this.docClient = DynamoDBDocumentClient.from(this.dynamodb);
      this.isConnected = true;
    } catch (error) {
      console.error('❌ DynamoDB initialization failed:', error.message);
      this.isConnected = false;
    }
  }

  // Helper to sanitize data for DynamoDB (converts ObjectIds to strings, etc.)
  sanitize(data) {
    if (!data) return data;
    return JSON.parse(JSON.stringify(data, (key, value) => {
      // Convert legacy IDs to strings
      if (value && typeof value === 'object' && value.hasOwnProperty('_bsontype')) {
        return value.toString();
      }
      // Handle Date objects
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    }));
  }

  async createTables() {
    if (!this.isConnected) return false;

    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

    try {
      // Create Videos table
      await this.createTable({
        TableName: `video-course-app-videos-${environment}`,
        KeySchema: [
          { AttributeName: 'courseName', KeyType: 'HASH' },
          { AttributeName: 'videoId', KeyType: 'RANGE' }
        ],
        AttributeDefinitions: [
          { AttributeName: 'courseName', AttributeType: 'S' },
          { AttributeName: 'videoId', AttributeType: 'S' }
        ],
        BillingMode: 'PAY_PER_REQUEST'
      });

      // Create Gamification table
      await this.createTable({
        TableName: `video-course-app-gamification-${environment}`,
        KeySchema: [
          { AttributeName: 'userId', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
          { AttributeName: 'userId', AttributeType: 'S' }
        ],
        BillingMode: 'PAY_PER_REQUEST'
      });

      // Create Users table
      await this.createTable({
        TableName: `video-course-app-users-${environment}`,
        KeySchema: [
          { AttributeName: 'email', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
          { AttributeName: 'email', AttributeType: 'S' }
        ],
        BillingMode: 'PAY_PER_REQUEST'
      });

      // Create Courses table
      await this.createTable({
        TableName: `video-course-app-courses-${environment}`,
        KeySchema: [
          { AttributeName: 'courseName', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
          { AttributeName: 'courseName', AttributeType: 'S' }
        ],
        BillingMode: 'PAY_PER_REQUEST'
      });

      // Create Captions table
      await this.createTable({
        TableName: `video-course-app-captions-${environment}`,
        KeySchema: [
          { AttributeName: 'courseName', KeyType: 'HASH' },
          { AttributeName: 'videoId', KeyType: 'RANGE' }
        ],
        AttributeDefinitions: [
          { AttributeName: 'courseName', AttributeType: 'S' },
          { AttributeName: 'videoId', AttributeType: 'S' }
        ],
        BillingMode: 'PAY_PER_REQUEST'
      });

      // Create Enrollments table
      await this.createTable({
        TableName: `video-course-app-enrollments-${environment}`,
        KeySchema: [
          { AttributeName: 'userId', KeyType: 'HASH' },
          { AttributeName: 'courseName', KeyType: 'RANGE' }
        ],
        AttributeDefinitions: [
          { AttributeName: 'userId', AttributeType: 'S' },
          { AttributeName: 'courseName', AttributeType: 'S' }
        ],
        BillingMode: 'PAY_PER_REQUEST'
      });

      // Create Certificates table
      await this.createTable({
        TableName: `video-course-app-certificates-${environment}`,
        KeySchema: [
          { AttributeName: 'userId', KeyType: 'HASH' },
          { AttributeName: 'certificateId', KeyType: 'RANGE' }
        ],
        AttributeDefinitions: [
          { AttributeName: 'userId', AttributeType: 'S' },
          { AttributeName: 'certificateId', AttributeType: 'S' }
        ],
        BillingMode: 'PAY_PER_REQUEST'
      });

      console.log('✅ All DynamoDB tables created successfully');
      return true;
    } catch (error) {
      console.error('❌ Error creating DynamoDB tables:', error.message);
      return false;
    }
  }

  async createTable(params) {
    const { CreateTableCommand, DescribeTableCommand, waitUntilTableExists } = require('@aws-sdk/client-dynamodb');
    
    try {
      // Check if table exists
      await this.dynamodb.send(new DescribeTableCommand({ TableName: params.TableName }));
      console.log(`📋 Table ${params.TableName} already exists`);
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        // Table doesn't exist, create it
        await this.dynamodb.send(new CreateTableCommand(params));
        console.log(`✅ Created table: ${params.TableName}`);
        
        // Wait for table to be active
        await waitUntilTableExists({ client: this.dynamodb, maxWaitTime: 300 }, { TableName: params.TableName });
        console.log(`🟢 Table ${params.TableName} is now active`);
      } else {
        throw error;
      }
    }
  }

  // Video operations
  async saveVideo(video) {
    if (!this.isConnected) return false;

    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

    try {
      // Handle videoId and legacy _id format
      const id = video.videoId || (video._id ? video._id.toString() : Date.now().toString());
      
      const params = {
        TableName: `video-course-app-videos-${environment}`,
        Item: {
          ...video,
          courseName: video.courseName,
          videoId: id,
          createdAt: video.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };

      // Ensure _id doesn't leak into the DynamoDB item if it originated from legacy source
      if (params.Item._id) delete params.Item._id;

      await this.docClient.send(new PutCommand(params));
      return true;
    } catch (error) {
      console.error('❌ Error saving video to DynamoDB:', error.name || error.message);
      if (error.name === 'InvalidSignatureException') {
        console.error('💡 TIP: Check your .env credentials and system clock. Signatures can fail if the clock is skewed.');
      }
      return false;
    }
  }

  async getVideosForCourse(courseName, userId = 'engineerfelex@gmail.com') {
    if (!this.isConnected) return null;

    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

    try {
      const params = {
        TableName: `video-course-app-videos-${environment}`,
        FilterExpression: 'courseName = :courseName',
        ExpressionAttributeValues: {
          ':courseName': courseName
        }
      };

      const result = await this.docClient.send(new ScanCommand(params));
      const videos = result.Items || [];
      
      // Remove duplicates by title+order combination and sort by order then title
      const uniqueVideos = videos.filter((video, index, self) => 
        index === self.findIndex(v => v.title === video.title && v.sectionTitle === video.sectionTitle)
      );
      
      return uniqueVideos.sort((a, b) => {
        // Sort by section order first, then by video order, then by title
        const sectionOrderA = a.sectionOrder || 0;
        const sectionOrderB = b.sectionOrder || 0;
        if (sectionOrderA !== sectionOrderB) {
          return sectionOrderA - sectionOrderB;
        }
        
        const orderA = a.order || 0;
        const orderB = b.order || 0;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        
        const titleA = (a.title || '').toLowerCase();
        const titleB = (b.title || '').toLowerCase();
        return titleA.localeCompare(titleB);
      });
    } catch (error) {
      console.error('Error getting videos from DynamoDB:', error);
      return null;
    }
  }

  async getAllCourses(userId = null, isTeacher = false) {
    if (!this.isConnected) return null;

    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

    try {
      // First try to get courses from the courses table
      const coursesParams = {
        TableName: `video-course-app-courses-${environment}`
      };

      const coursesResult = await this.docClient.send(new ScanCommand(coursesParams));
      const courses = [];
      
      // Process courses from courses table
      for (const courseItem of coursesResult.Items || []) {
        // Load videos for all courses, let getVideosForCourse handle user filtering
        const videos = await this.getVideosForCourse(courseItem.courseName, userId);
        
        courses.push({
          _id: courseItem.courseName, // For frontend compatibility
          name: courseItem.courseName,
          title: courseItem.title,
          description: courseItem.description,
          totalVideos: courseItem.totalVideos,
          videos: videos || [],
          offlineMode: false
        });
      }
      
      // Also get courses from videos table (for backward compatibility)
      const videosParams = {
        TableName: `video-course-app-videos-${environment}`,
        ProjectionExpression: 'courseName'
      };

      const videosResult = await this.docClient.send(new ScanCommand(videosParams));
      const videosCourseNames = [...new Set(videosResult.Items.map(item => item.courseName))];
      
      // Add any courses that are only in videos table
      for (const courseName of videosCourseNames) {
        if (!courses.find(c => c.name === courseName)) {
          const videos = await this.getVideosForCourse(courseName, userId);
          courses.push({
            _id: courseName,
            name: courseName,
            videos: videos || [],
            offlineMode: false
          });
        }
      }

      return courses;
    } catch (error) {
      console.error('Error getting courses from DynamoDB:', error);
      return null;
    }
  }

  async updateVideoWatchStatus(courseName, videoId, watched, userId = 'engineerfelex@gmail.com') {
    if (!this.isConnected) return false;

    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

    try {
      // Find the video first using scan since table structure varies
      const findParams = {
        TableName: `video-course-app-videos-${environment}`,
        FilterExpression: 'courseName = :courseName AND videoId = :videoId',
        ExpressionAttributeValues: {
          ':courseName': courseName,
          ':videoId': videoId
        }
      };

      const findResult = await this.docClient.send(new ScanCommand(findParams));
      if (!findResult.Items || findResult.Items.length === 0) {
        console.error('Video not found for watch status update');
        return false;
      }

      const video = findResult.Items[0];
      
      // Update using the actual key structure
      const updateParams = {
        TableName: `video-course-app-videos-${environment}`,
        Key: video.userId ? 
          { userId: video.userId, videoId: videoId } : 
          { courseName: courseName, videoId: videoId },
        UpdateExpression: 'SET watched = :watched, watchedAt = :watchedAt, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':watched': watched,
          ':watchedAt': watched ? new Date().toISOString() : null,
          ':updatedAt': new Date().toISOString()
        }
      };

      await this.docClient.send(new UpdateCommand(updateParams));
      return true;
    } catch (error) {
      console.error('Error updating video watch status in DynamoDB:', error);
      return false;
    }
  }

  // Gamification operations
  async saveGamificationData(userId = 'engineerfelex@gmail.com', data) {
    if (!this.isConnected) return false;

    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

    try {
      // Sanitize data to convert ObjectIds to strings
      const sanitizedData = JSON.parse(JSON.stringify(data, (key, value) => {
        if (value && typeof value === 'object' && value.constructor && value.constructor.name === 'ObjectId') {
          return value.toString();
        }
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      }));

      const params = {
        TableName: `video-course-app-gamification-${environment}`,
        Item: {
          userId: userId,
          ...sanitizedData,
          updatedAt: new Date().toISOString()
        }
      };

      await this.docClient.send(new PutCommand(params));
      return true;
    } catch (error) {
      console.error('Error saving gamification data to DynamoDB:', error);
      return false;
    }
  }

  async getGamificationData(userId = 'engineerfelex@gmail.com') {
    if (!this.isConnected) return null;

    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

    try {
      const params = {
        TableName: `video-course-app-gamification-${environment}`,
        Key: { userId: userId }
      };

      const result = await this.docClient.send(new GetCommand(params));
      return result.Item || null;
    } catch (error) {
      console.error('Error getting gamification data from DynamoDB:', error);
      return null;
    }
  }

  // Course operations
  async saveCourse(course) {
    if (!this.isConnected) return false;

    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

    try {
      const sanitized = this.sanitize(course);
      const params = {
        TableName: `video-course-app-courses-${environment}`,
        Item: {
          courseName: sanitized.name || sanitized.courseName || sanitized.title,
          ...sanitized,
          createdAt: sanitized.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };

      await this.docClient.send(new PutCommand(params));
      return true;
    } catch (error) {
      console.error('Error saving course to DynamoDB:', error);
      return false;
    }
  }

  // User operations
  async saveUser(user) {
    if (!this.isConnected) return false;

    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

    try {
      const sanitized = this.sanitize(user);
      const params = {
        TableName: `video-course-app-users-${environment}`,
        Item: {
          ...sanitized,
          createdAt: sanitized.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };

      await this.docClient.send(new PutCommand(params));
      return true;
    } catch (error) {
      console.error('Error saving user to DynamoDB:', error);
      return false;
    }
  }

  async getUser(email) {
    if (!this.isConnected) return null;

    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

    try {
      const params = {
        TableName: `video-course-app-users-${environment}`,
        Key: { email: email }
      };

      const result = await this.docClient.send(new GetCommand(params));
      return result.Item || null;
    } catch (error) {
      console.error('Error getting user from DynamoDB:', error);
      return null;
    }
  }

  async getAllUsers() {
    if (!this.isConnected) return [];
    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
    try {
      const params = {
        TableName: `video-course-app-users-${environment}`
      };
      const result = await this.docClient.send(new ScanCommand(params));
      return result.Items || [];
    } catch (error) {
      console.error('Error getting all users from DynamoDB:', error);
      return [];
    }
  }

  // Enrollment operations
  async saveEnrollment(userId, courseName) {
    if (!this.isConnected) return false;
    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
    try {
      const params = {
        TableName: `video-course-app-enrollments-${environment}`,
        Item: {
          userId: userId.toString(),
          courseName: courseName.toString(),
          enrolledAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };
      await this.docClient.send(new PutCommand(params));
      return true;
    } catch (error) {
      console.error('Error saving enrollment to DynamoDB:', error);
      return false;
    }
  }

  async getEnrollments(userId) {
    if (!this.isConnected) return [];
    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
    try {
      const params = {
        TableName: `video-course-app-enrollments-${environment}`,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        }
      };
      const result = await this.docClient.send(new QueryCommand(params));
      return result.Items || [];
    } catch (error) {
      console.error('Error getting enrollments from DynamoDB:', error);
      return [];
    }
  }

  // Certificate operations
  async saveCertificate(certificate) {
    if (!this.isConnected) return false;
    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
    try {
      const sanitized = this.sanitize(certificate);
      const params = {
        TableName: `video-course-app-certificates-${environment}`,
        Item: {
          ...sanitized,
          issuedDate: sanitized.issuedDate || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };
      await this.docClient.send(new PutCommand(params));
      return true;
    } catch (error) {
      console.error('Error saving certificate to DynamoDB:', error);
      return false;
    }
  }

  async getCertificates(userId) {
    if (!this.isConnected) return [];
    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
    try {
      const params = {
        TableName: `video-course-app-certificates-${environment}`,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        }
      };
      const result = await this.docClient.send(new QueryCommand(params));
      return result.Items || [];
    } catch (error) {
      console.error('Error getting certificates from DynamoDB:', error);
      return [];
    }
  }

  // Delete operations
  async deleteCourse(courseName) {
    if (!this.isConnected) return false;
    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
    try {
      const params = {
        TableName: `video-course-app-courses-${environment}`,
        Key: { courseName: courseName }
      };
      const { DeleteCommand } = require('@aws-sdk/lib-dynamodb');
      await this.docClient.send(new DeleteCommand(params));
      return true;
    } catch (error) {
      console.error('Error deleting course:', error);
      return false;
    }
  }

  async deleteVideo(courseName, videoId) {
    if (!this.isConnected) return false;
    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
    try {
      const params = {
        TableName: `video-course-app-videos-${environment}`,
        Key: { 
          courseName: courseName,
          videoId: videoId
        }
      };
      const { DeleteCommand } = require('@aws-sdk/lib-dynamodb');
      await this.docClient.send(new DeleteCommand(params));
      return true;
    } catch (error) {
      console.error('Error deleting video:', error);
      return false;
    }
  }

  async deleteUser(email) {
    if (!this.isConnected) return false;
    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
    try {
      const params = {
        TableName: `video-course-app-users-${environment}`,
        Key: { email: email }
      };
      const { DeleteCommand } = require('@aws-sdk/lib-dynamodb');
      await this.docClient.send(new DeleteCommand(params));
      return true;
    } catch (error) {
      console.error('Error deleting user:', error);
      return false;
    }
  }

  // Migration helpers
  async migrateFromLocalStorage(localStorageData, gamificationData) {
    if (!this.isConnected) return false;

    try {
      console.log('🔄 Starting DynamoDB migration...');
      
      // Migrate videos
      let videoCount = 0;
      for (const [courseName, videos] of Object.entries(localStorageData)) {
        if (Array.isArray(videos)) {
          for (const video of videos) {
            await this.saveVideo({
              ...video,
              courseName: courseName
            });
            videoCount++;
          }
        }
      }

      // Migrate gamification data to engineerfelex@gmail.com
      let gamificationCount = 0;
      for (const [userId, data] of Object.entries(gamificationData)) {
        await this.saveGamificationData('engineerfelex@gmail.com', data);
        gamificationCount++;
      }

      console.log(`✅ Migration completed: ${videoCount} videos, ${gamificationCount} gamification records`);
      return true;
    } catch (error) {
      console.error('❌ Migration failed:', error);
      return false;
    }
  }

  // Update course properties
  async updateCourse(courseName, courseData) {
    try {
      const courses = await this.getAllCourses();
      const courseIndex = courses.findIndex(c => c.name === courseName);
      
      if (courseIndex !== -1) {
        courses[courseIndex] = {
          ...courses[courseIndex],
          ...courseData,
          updatedAt: new Date().toISOString()
        };
        
        // Update in DynamoDB (simplified - you may want to use a proper courses table)
        console.log('Course updated:', courses[courseIndex]);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error updating course:', error);
      return false;
    }
  }

  // Update video properties
  async updateVideo(courseName, videoId, videoData) {
    if (!this.isConnected) return false;

    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

    try {
      const updateParams = {
        TableName: `video-course-app-videos-${environment}`,
        Key: {
          courseName: courseName,
          videoId: videoId
        },
        UpdateExpression: 'SET #captionUrl = :captionUrl, #s3CaptionKey = :s3CaptionKey, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#captionUrl': 'captionUrl',
          '#s3CaptionKey': 's3CaptionKey',
          '#updatedAt': 'updatedAt'
        },
        ExpressionAttributeValues: {
          ':captionUrl': videoData.captionUrl,
          ':s3CaptionKey': videoData.s3CaptionKey,
          ':updatedAt': new Date().toISOString()
        }
      };

      await this.docClient.send(new UpdateCommand(updateParams));
      return true;
    } catch (error) {
      console.error('Error updating video:', error);
      return false;
    }
  }

  // Add video to course
  async addVideoToCourse(courseName, videoData) {
    if (!this.isConnected) return false;

    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

    try {
      const params = {
        TableName: `video-course-app-videos-${environment}`,
        Item: {
          courseName: courseName,
          videoId: Date.now().toString(),
          ...videoData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };

      await this.docClient.send(new PutCommand(params));
      return true;
    } catch (error) {
      console.error('Error adding video to DynamoDB:', error);
      return false;
    }
  }

  isAvailable() {
    return this.isConnected;
  }
}

module.exports = new DynamoDBService();