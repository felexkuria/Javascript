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
      const logger = require('../utils/logger');
      logger.error('Error getting all courses from DynamoDB', error);
      return [];
    }
  }

  async getCourseById(id, userId) {
    try {
      // Fetch from DynamoDB
      const course = await dynamoVideoService.getCourseByTitle(id, userId);
      return course;
    } catch (error) {
      const logger = require('../utils/logger');
      logger.error('Error getting course by ID from DynamoDB', error, { id });
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

      const logger = require('../utils/logger');
      logger.info('✅ S3 to DynamoDB sync completed');
    } catch (error) {
      const logger = require('../utils/logger');
      logger.warn('Sync failed', { error: error.message });
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

  /**
   * 🏗️ Atomic Deletion Saga (Senior Data Engineer)
   * Ensures that S3 objects and DynamoDB records are purged atomically.
   * Prevents "Zombie" files in S3 if a database delete fails.
   */
  async deleteCourseData(title) {
    const logger = require('../utils/logger');
    const { withRetry } = require('../utils/retry');
    const decodedTitle = decodeURIComponent(title);
    
    logger.info(`🗑️ Saga Initiated: Deleting course "${decodedTitle}"`, { title });

    try {
      // --- STAGE 1: Mark for Deletion ---
      // This prevents further access and identifies the record for cleanup if the process crashes.
      const marked = await dynamodb.markCourseForDeletion(decodedTitle);
      if (!marked) throw new Error('Saga Phase 1 Failed: Could not mark course as DELETING');

      // --- STAGE 2: Resource Purge (S3) ---
      const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
      const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
      const bucketName = process.env.S3_BUCKET_NAME;

      if (bucketName) {
        const course = await dynamoVideoService.getCourseByTitle(decodedTitle);
        const videos = course?.videos || [];
        const slug = decodedTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        // 1. Gather all specific keys to delete
        const specificKeys = videos
          .map(v => v.s3Key || v.key)
          .filter(k => !!k)
          .map(k => ({ Key: k }));

        // 2. Define common prefixes for broad sweep
        const prefixes = [`courses/${slug}/`, `videos/${decodedTitle}/`, `processed-content/captions/${decodedTitle}/` ];

        // 3. Execute Deletion with Retry
        await withRetry(async () => {
          // A. Delete specific objects
          if (specificKeys.length > 0) {
            for (let i = 0; i < specificKeys.length; i += 1000) {
              await s3Client.send(new DeleteObjectsCommand({
                Bucket: bucketName,
                Delete: { Objects: specificKeys.slice(i, i + 1000) }
              }));
            }
          }

          // B. Prefix sweep
          for (const prefix of prefixes) {
            const listRes = await s3Client.send(new ListObjectsV2Command({ Bucket: bucketName, Prefix: prefix }));
            if (listRes.Contents?.length > 0) {
              await s3Client.send(new DeleteObjectsCommand({
                Bucket: bucketName,
                Delete: { Objects: listRes.Contents.map(o => ({ Key: o.Key })) }
              }));
            }
          }
        });
        
        logger.info(`🗑️ Saga Phase 2 Complete: S3 assets purged for "${decodedTitle}"`);
      }

      // --- STAGE 3: Final Purge (DynamoDB) ---
      // This is the "Commit" phase of the saga.
      const purged = await dynamodb.purgeCourse(decodedTitle);
      if (!purged) throw new Error('Saga Phase 3 Failed: Could not purge DynamoDB record');

      logger.info(`✅ Saga Success: Course "${decodedTitle}" fully purged from the system.`);
      return { success: true };

    } catch (error) {
      logger.error(`❌ Saga Aborted: Failed to delete course "${decodedTitle}"`, error);
      // We don't "rollback" Stage 1 because the course IS actually intended for deletion.
      // Instead, Stage 1 serves as a tombstone for a cleanup worker.
      throw error;
    }
  }
}

module.exports = new CourseService();