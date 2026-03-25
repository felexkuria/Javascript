// Purged legacy videoService
const dynamoVideoService = require('./dynamoVideoService');
const dynamodb = require('../utils/dynamodb');
const path = require('path');
const fs = require('fs');

class CourseService {
  async getAllCourses() {
    try {
      const userId = 'engineerfelex@gmail.com'; // Default for sync/listing
      
      // 1. Fetch from DynamoDB
      const coursesData = await dynamoVideoService.getAllCourses(userId);
      
      // 2. Normalize for frontend
      const courses = coursesData.map(c => ({
        name: c.name,
        title: c.name,
        category: c.category || 'Core',
        description: c.description || this.generateDescription(c.name),
        videoCount: c.videos?.length || 0,
        watchedVideos: c.videos?.filter(v => v.watched).length || 0,
        completionPercentage: c.videos?.length > 0 ? 
          Math.round((c.videos.filter(v => v.watched).length / c.videos.length) * 100) : 0,
        isMongo: false
      }));

      return courses;
    } catch (error) {
      console.error('Error getting all courses from DynamoDB:', error);
      return [];
    }
  }

  async getCourseById(id, userId) {
    try {
      // Fetch from DynamoDB
      const course = await dynamoVideoService.getCourseByTitle(id, userId);
      return course;
    } catch (error) {
      console.error('Error getting course by ID from DynamoDB:', error);
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

  async deleteCourseData(title) {
    try {
      const course = await dynamoVideoService.getCourseByTitle(title);
      if (!course) throw new Error('Course not found');

      const slug = title.toLowerCase().replace(/\s+/g, '-');

      // 1. Delete Enrollments (Handled via DynamoDB)
      console.log(`🗑️ Initiating deletion for course: ${title}`);

      // 2. Delete from S3 (Curriculum files)
      const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
      const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
      
      if (process.env.S3_BUCKET_NAME) {
        try {
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

      // 3. Delete from DynamoDB
      try {
        await dynamoVideoService.deleteCourse(title);
        console.log(`🗑️ Deleted course "${title}" from DynamoDB`);
      } catch (dynamoErr) {
        console.error('⚠️ DynamoDB cleanup failed during course deletion:', dynamoErr.message);
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting course data:', error);
      throw error;
    }
  }
}

module.exports = new CourseService();