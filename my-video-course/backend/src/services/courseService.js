// Purged legacy videoService
const dynamoVideoService = require('./dynamoVideoService');
const dynamodb = require('../utils/dynamodb');
const path = require('path');
const fs = require('fs');

const CourseModel = require('../models/Course');

class CourseService {
  async getAllCourses() {
    try {
      const userId = 'engineerfelex@gmail.com'; // Default for sync/listing
      
      // 1. Fetch from DynamoDB (Legacy/Hybrid)
      const coursesData = await dynamoVideoService.getAllCourses(userId);
      
      // 2. Fetch from MongoDB (New Architecture)
      const mongoCourses = await CourseModel.find({ isPublished: true }).lean();
      
      // 3. Merge and Normalize
      const mergedCourses = [];
      const seenTitles = new Set();

      // Add MongoDB courses first (preferred)
      mongoCourses.forEach(c => {
        mergedCourses.push({
          _id: c._id,
          name: c.title,
          title: c.title,
          category: c.category || 'Core',
          description: c.description,
          videoCount: (c.sections || []).reduce((sum, s) => sum + (s.lectures?.length || 0), 0),
          watchedVideos: 0, // Needs progress service integration
          completionPercentage: 0,
          sections: c.sections,
          isMongo: true
        });
        seenTitles.add(c.title.toLowerCase());
      });

      // Add DynamoDB courses if not already seen
      coursesData.forEach(c => {
        if (!seenTitles.has(c.name.toLowerCase())) {
          mergedCourses.push({
            name: c.name,
            title: c.name,
            videoCount: c.videos?.length || 0,
            watchedVideos: c.videos?.filter(v => v.watched).length || 0,
            completionPercentage: c.videos?.length > 0 ? 
              Math.round((c.videos.filter(v => v.watched).length / c.videos.length) * 100) : 0,
            isMongo: false
          });
        }
      });

      if (mergedCourses.length > 0) {
        return mergedCourses;
      }
      if (coursesData.length > 0) {
        return coursesData.map(c => ({
          name: c.name,
          videoCount: c.videos?.length || 0,
          watchedVideos: c.videos?.filter(v => v.watched).length || 0,
          completionPercentage: c.videos?.length > 0 ? 
            Math.round((c.videos.filter(v => v.watched).length / c.videos.length) * 100) : 0
        }));
      }
      
      // Fallback to localStorage
      const videoDir = path.join(__dirname, '../../../frontend/public/videos');
      
      if (!fs.existsSync(videoDir)) {
        return [];
      }

      const courseFolders = fs.readdirSync(videoDir).filter(folder => {
        return fs.statSync(path.join(videoDir, folder)).isDirectory();
      });

      const localStorage = dynamoVideoService.getLocalStorage();
      const courses = [];

      for (const courseFolder of courseFolders) {
        const courseVideos = localStorage[courseFolder] || [];
        const watchedVideos = courseVideos.filter(v => v && v.watched).length;
        
        courses.push({
          name: courseFolder,
          videoCount: courseVideos.length,
          watchedVideos: watchedVideos,
          completionPercentage: courseVideos.length > 0 ? Math.round((watchedVideos / courseVideos.length) * 100) : 0
        });
      }

      return courses;
    } catch (error) {
      console.error('Error getting all courses:', error);
      return [];
    }
  }
  
  async getAllVideos() {
    try {
      const userId = 'engineerfelex@gmail.com';
      const courses = await dynamoVideoService.getAllCourses(userId);
      return courses.flatMap(c => (c.videos || []).map(v => ({
        _id: v._id,
        title: v.title,
        courseName: c.name,
        watched: v.watched || false
      })));
      
      // Fallback to localStorage
      const localStorage = dynamoVideoService.getLocalStorage();
      const allVideos = [];
      
      Object.keys(localStorage).forEach(courseName => {
        const courseVideos = localStorage[courseName] || [];
        courseVideos.forEach(video => {
          if (video && video._id) {
            allVideos.push({
              _id: video._id,
              title: video.title,
              courseName: courseName,
              watched: video.watched || false
            });
          }
        });
      });
      
      return allVideos;
    } catch (error) {
      console.error('Error getting all videos:', error);
      return [];
    }
  }

  async getCourseByName(courseName) {
    try {
      const decodedCourseName = decodeURIComponent(courseName);
      const videos = await dynamoVideoService.getVideosForCourse(decodedCourseName, 'guest');
      
      if (!videos || videos.length === 0) {
        return null;
      }

      const watchedVideos = videos.filter(v => v && v.watched).length;
      
      return {
        name: decodedCourseName,
        title: decodedCourseName,
        videos: videos,
        totalVideos: videos.length,
        watchedVideos: watchedVideos,
        completionPercentage: Math.round((watchedVideos / videos.length) * 100)
      };
    } catch (error) {
      console.error('Error getting course by name:', error);
      return null;
    }
  }

  // Sync S3 videos to DynamoDB
  async syncS3VideosToDynamoDB() {
    try {
      const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
      const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
      const dynamodb = require('../utils/dynamodb');
      
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Prefix: 'videos/'
      };
      
      const command = new ListObjectsV2Command(params);
      const s3Objects = await s3.send(command);
      
      if (!s3Objects.Contents) return;

      const videoFiles = s3Objects.Contents.filter(obj => obj.Key.endsWith('.mp4'));
      
      for (const file of videoFiles) {
        const keyParts = file.Key.split('/');
        if (keyParts.length >= 3) {
          const courseName = keyParts[1];
          const videoTitle = keyParts[2].replace('.mp4', '');
          const videoId = videoTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          
          // ── Ensure Course exists in MongoDB too ───────────────────
          const Course = require('../models/Course');
          let mongoCourse = await Course.findOne({ title: courseName });
          if (!mongoCourse) {
            try {
              mongoCourse = await Course.create({
                title: courseName,
                slug: courseName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                instructorId: 'engineerfelex@gmail.com',
                isPublished: true,
                sections: [{ title: 'Lessons', lectures: [] }]
              });
              console.log(`✅ Created MongoDB Course for S3 Course: ${courseName}`);
            } catch (err) {
              console.error(`❌ Failed to create MongoDB Course "${courseName}":`, err.message);
            }
          }

          const success = await dynamodb.saveVideo({
            videoId: videoId,
            title: videoTitle,
            courseName: courseName,
            sectionTitle: 'Lessons',
            s3Key: file.Key,
            s3Url: `s3://${process.env.S3_BUCKET_NAME}/${file.Key}`,
            watched: false,
            createdAt: new Date().toISOString()
          });

          // Link to MongoDB if it was a missing lecture
          if (mongoCourse) {
            const hasLecture = mongoCourse.sections[0].lectures.some(l => l.contentId === videoId);
            if (!hasLecture) {
              await Course.findByIdAndUpdate(mongoCourse._id, {
                $push: { 'sections.0.lectures': {
                  title: videoTitle,
                  contentId: videoId,
                  s3Key: file.Key,
                  type: 'video'
                }},
                $inc: { totalVideos: 1 }
              });
            }
          }
          
          if (success) {
            console.log(`✅ Synced S3 video to DynamoDB: ${courseName}/${videoTitle}`);
          }
        }
      }
    } catch (error) {
      console.warn('S3 sync failed:', error.message);
    }
  }
  
  async generateDescription(courseName) {
    const decodedCourseName = decodeURIComponent(courseName);
    
    if (decodedCourseName.toLowerCase().includes('terraform')) {
      return 'Master HashiCorp Terraform with hands-on Infrastructure as Code practices. Learn to provision, manage, and scale cloud resources declaratively.';
    } else if (decodedCourseName.toLowerCase().includes('aws')) {
      return 'Comprehensive AWS cloud computing course covering core services, architecture patterns, and best practices for scalable cloud solutions.';
    } else if (decodedCourseName.toLowerCase().includes('devops')) {
      return 'Complete DevOps bootcamp covering CI/CD, containerization, infrastructure automation, and modern development practices.';
    } else {
      return `Learn ${decodedCourseName} through comprehensive lessons and practical exercises with hands-on projects.`;
    }
  }
}

module.exports = new CourseService();