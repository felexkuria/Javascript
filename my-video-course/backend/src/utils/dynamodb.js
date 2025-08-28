const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
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
      // Configure AWS SDK v3
      const config = {
        region: process.env.AWS_REGION || 'us-east-1'
      };
      
      // Only add credentials if they exist
      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        config.credentials = {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        };
      }
      
      this.dynamodb = new DynamoDBClient(config);

      this.docClient = DynamoDBDocumentClient.from(this.dynamodb);
      this.isConnected = true;
      console.log('✅ DynamoDB initialized with AWS SDK v3');
    } catch (error) {
      console.error('❌ DynamoDB initialization failed:', error.message);
      this.isConnected = false;
    }
  }

  async createTables() {
    if (!this.isConnected) return false;

    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

    try {
      // Create Videos table
      await this.createTable({
        TableName: `video-course-videos-${environment}`,
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
        TableName: `video-course-gamification-${environment}`,
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
        TableName: `video-course-users-${environment}`,
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
        TableName: `video-course-courses-${environment}`,
        KeySchema: [
          { AttributeName: 'courseName', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
          { AttributeName: 'courseName', AttributeType: 'S' }
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
      const params = {
        TableName: `video-course-videos-${environment}`,
        Item: {
          courseName: video.courseName,
          videoId: video._id.toString(),
          ...video,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };

      await this.docClient.send(new PutCommand(params));
      return true;
    } catch (error) {
      console.error('Error saving video to DynamoDB:', error);
      return false;
    }
  }

  async getVideosForCourse(courseName, userId = 'engineerfelex@gmail.com') {
    if (!this.isConnected) return null;

    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

    try {
      const params = {
        TableName: `video-course-videos-${environment}`,
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
        TableName: `video-course-courses-${environment}`
      };

      const coursesResult = await this.docClient.send(new ScanCommand(coursesParams));
      const courses = [];
      
      // Process courses from courses table
      for (const courseItem of coursesResult.Items || []) {
        // Load videos for all courses, let getVideosForCourse handle user filtering
        const videos = await this.getVideosForCourse(courseItem.courseName, userId);
        
        courses.push({
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
        TableName: `video-course-videos-${environment}`,
        ProjectionExpression: 'courseName'
      };

      const videosResult = await this.docClient.send(new ScanCommand(videosParams));
      const videosCourseNames = [...new Set(videosResult.Items.map(item => item.courseName))];
      
      // Add any courses that are only in videos table
      for (const courseName of videosCourseNames) {
        if (!courses.find(c => c.name === courseName)) {
          const videos = await this.getVideosForCourse(courseName, userId);
          courses.push({
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
        TableName: `video-course-videos-${environment}`,
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
        TableName: `video-course-videos-${environment}`,
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
      const params = {
        TableName: `video-course-gamification-${environment}`,
        Item: {
          userId: userId,
          ...data,
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
        TableName: `video-course-gamification-${environment}`,
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
      const params = {
        TableName: `video-course-courses-${environment}`,
        Item: {
          courseName: course.name,
          ...course,
          createdAt: course.createdAt || new Date().toISOString(),
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
      // Convert Date objects to ISO strings
      const sanitizedUser = JSON.parse(JSON.stringify(user, (key, value) => {
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      }));

      const params = {
        TableName: `video-course-users-${environment}`,
        Item: {
          ...sanitizedUser,
          createdAt: sanitizedUser.createdAt || new Date().toISOString(),
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
        TableName: `video-course-users-${environment}`,
        Key: { email: email }
      };

      const result = await this.docClient.send(new GetCommand(params));
      return result.Item || null;
    } catch (error) {
      console.error('Error getting user from DynamoDB:', error);
      return null;
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

  isAvailable() {
    return this.isConnected;
  }
}

module.exports = new DynamoDBService();