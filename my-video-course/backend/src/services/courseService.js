// Purged legacy videoService
const dynamoVideoService = require('./dynamoVideoService');
const dynamodb = require('../utils/dynamodb');
const path = require('path');
const fs = require('fs');

const CourseModel = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const { S3Client, DeleteObjectsCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

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

  async getCourseById(id, userId) {
    try {
      // 1. Try MongoDB first (New Architecture)
      const mongoose = require('mongoose');
      const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { slug: id };
      const mongoCourse = await CourseModel.findOne(query).lean();
      
      if (mongoCourse) {
        const allLectures = (mongoCourse.sections || []).flatMap(s => s.lectures || []);
        return {
          _id: mongoCourse._id,
          name: mongoCourse.title,
          title: mongoCourse.title,
          description: mongoCourse.description,
          instructor: 'Engineer Felex',
          videos: allLectures,
          sections: mongoCourse.sections,
          isMongo: true
        };
      }

      // 2. Try DynamoDB (Legacy/Hybrid)
      const course = await dynamoVideoService.getCourseByTitle(id, userId);
      return course;
    } catch (error) {
      console.error('Error getting course by ID:', error);
      return null;
    }
  }

  async syncS3VideosToDynamoDB() {
    try {
      const bucketName = process.env.S3_BUCKET_NAME;
      if (!bucketName) return;

      const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
      const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

      // List objects in videos/ folder
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: 'videos/'
      });

      const response = await s3.send(command);
      if (!response.Contents) return;

      const courses = {};

      for (const obj of response.Contents) {
        const parts = obj.Key.split('/');
        if (parts.length < 3) continue;

        const courseName = parts[1];
        const fileName = parts[2];
        if (!fileName.endsWith('.mp4')) continue;

        if (!courses[courseName]) courses[courseName] = [];
        
        courses[courseName].push({
          videoId: fileName.split('-')[0] || Date.now().toString(),
          title: fileName.replace(/^\d+-/, '').replace('.mp4', '').replace(/_/g, ' '),
          videoUrl: `https://${bucketName}.s3.amazonaws.com/${obj.Key}`,
          s3Key: obj.Key,
          watched: false
        });
      }

      // Save to DynamoDB
      for (const [courseName, videos] of Object.entries(courses)) {
        await dynamoVideoService.updateCourseVideos(courseName, videos, 'engineerfelex@gmail.com');
      }

      console.log('✅ S3 to DynamoDB sync completed');
    } catch (error) {
      console.warn('Sync failed:', error.message);
    }
  }

  generateDescription(courseName) {
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

  async deleteCourseData(courseId) {
    try {
      const course = await CourseModel.findById(courseId);
      if (!course) throw new Error('Course not found');

      const title = course.title;
      const slug = course.slug || title.toLowerCase().replace(/\s+/g, '-');

      // 1. Delete Enrollments
      const enrollResult = await Enrollment.deleteMany({ courseId });
      console.log(`🗑️ Deleted ${enrollResult.deletedCount} enrollments for course: ${title}`);

      // 2. Delete from S3 (Curriculum files)
      if (process.env.S3_BUCKET_NAME) {
        try {
          // List all objects under the course's prefix
          const prefix = `courses/${slug}/`;
          const listCommand = new ListObjectsV2Command({
            Bucket: process.env.S3_BUCKET_NAME,
            Prefix: prefix
          });
          const listResponse = await s3Client.send(listCommand);

          if (listResponse.Contents && listResponse.Contents.length > 0) {
            const deleteParams = {
              Bucket: process.env.S3_BUCKET_NAME,
              Delete: {
                Objects: listResponse.Contents.map(obj => ({ Key: obj.Key }))
              }
            };
            await s3Client.send(new DeleteObjectsCommand(deleteParams));
            console.log(`🗑️ Deleted ${listResponse.Contents.length} objects from S3 for course: ${title}`);
          }
        } catch (s3Err) {
          console.error('⚠️ S3 cleanup failed during course deletion:', s3Err.message);
        }
      }

      // 3. Delete from DynamoDB (Legacy/Hybrid)
      try {
        await dynamoVideoService.deleteCourse(title);
        console.log(`🗑️ Deleted course "${title}" from DynamoDB`);
      } catch (dynamoErr) {
        console.error('⚠️ DynamoDB cleanup failed during course deletion:', dynamoErr.message);
      }

      // 4. Delete MongoDB Course Document
      await CourseModel.findByIdAndDelete(courseId);
      console.log(`🗑️ Deleted course document from MongoDB: ${title}`);

      return { success: true };
    } catch (error) {
      console.error('Error deleting course data:', error);
      throw error;
    }
  }
}

module.exports = new CourseService();