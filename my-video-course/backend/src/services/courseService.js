const videoService = require('./videoService');
const path = require('path');
const fs = require('fs');

class CourseService {
  async getAllCourses() {
    try {
      const mongoose = require('mongoose');
      const Video = require('../models/Video');
      
      // Try MongoDB first if connected
      if (mongoose.connection.readyState === 1) {
        try {
          // Sync S3 videos to MongoDB first
          await this.syncS3VideosToMongoDB();
          
          const courses = await Video.aggregate([
            { $group: { 
              _id: '$courseName', 
              videoCount: { $sum: 1 },
              watchedCount: { $sum: { $cond: ['$watched', 1, 0] } }
            }},
            { $project: {
              name: '$_id',
              videoCount: 1,
              watchedVideos: '$watchedCount',
              completionPercentage: { 
                $round: [{ $multiply: [{ $divide: ['$watchedCount', '$videoCount'] }, 100] }, 0] 
              }
            }}
          ]);
          
          if (courses.length > 0) {
            return courses;
          }
        } catch (err) {
          console.error('MongoDB course query failed:', err);
        }
      }
      
      // Fallback to localStorage
      const videoDir = path.join(__dirname, '../../../frontend/public/videos');
      
      if (!fs.existsSync(videoDir)) {
        return [];
      }

      const courseFolders = fs.readdirSync(videoDir).filter(folder => {
        return fs.statSync(path.join(videoDir, folder)).isDirectory();
      });

      const localStorage = videoService.getLocalStorage();
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
      const mongoose = require('mongoose');
      const Video = require('../models/Video');
      
      // Try MongoDB first
      if (mongoose.connection.readyState === 1) {
        try {
          const videos = await Video.find({}).select('title courseName watched _id').lean();
          if (videos.length > 0) {
            return videos;
          }
        } catch (err) {
          console.error('MongoDB video query failed:', err);
        }
      }
      
      // Fallback to localStorage
      const localStorage = videoService.getLocalStorage();
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
      const videos = await videoService.getVideosForCourse(decodedCourseName);
      
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

  // Sync S3 videos to MongoDB
  async syncS3VideosToMongoDB() {
    try {
      const { S3Client } = require('@aws-sdk/client-s3');
      const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
      const Video = require('../models/Video');
      
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Prefix: 'videos/'
      };
      
      const s3Objects = await s3.listObjectsV2(params).promise();
      const videoFiles = s3Objects.Contents.filter(obj => obj.Key.endsWith('.mp4'));
      
      for (const file of videoFiles) {
        const keyParts = file.Key.split('/');
        if (keyParts.length >= 3) {
          const courseName = keyParts[1];
          const videoTitle = keyParts[2].replace('.mp4', '');
          
          // Check if video already exists
          const existingVideo = await Video.findOne({ title: videoTitle, courseName });
          
          if (!existingVideo) {
            await Video.create({
              title: videoTitle,
              courseName,
              s3Key: file.Key,
              s3Url: `s3://${process.env.S3_BUCKET_NAME}/${file.Key}`,
              watched: false,
              captionsReady: false,
              quizReady: false,
              summaryReady: false,
              processing: false,
              createdAt: new Date()
            });
            console.log(`✅ Synced S3 video: ${courseName}/${videoTitle}`);
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
      return `Master HashiCorp Terraform with hands-on Infrastructure as Code practices. Learn to provision, manage, and scale cloud resources declaratively.`;
    } else if (decodedCourseName.toLowerCase().includes('aws')) {
      return `Comprehensive AWS cloud computing course covering core services, architecture patterns, and best practices for scalable cloud solutions.`;
    } else if (decodedCourseName.toLowerCase().includes('devops')) {
      return `Complete DevOps bootcamp covering CI/CD, containerization, infrastructure automation, and modern development practices.`;
    } else {
      return `Learn ${decodedCourseName} through comprehensive lessons and practical exercises with hands-on projects.`;
    }
  }
}

module.exports = new CourseService();