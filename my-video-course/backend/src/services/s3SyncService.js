const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const dynamodb = require('../utils/dynamodb');

class S3SyncService {
  constructor() {
    this.s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    this.bucketName = process.env.S3_BUCKET_NAME;
  }

  // Sync S3 videos to DynamoDB
  async syncS3ToDynamoDB() {
    try {
      if (!this.bucketName) {
        console.log('S3_BUCKET_NAME not configured, skipping sync');
        return 0;
      }

      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: 'videos/'
      });

      const s3Objects = await this.s3.send(command);
      const videoFiles = s3Objects.Contents?.filter(obj => 
        obj.Key.endsWith('.mp4') && obj.Key !== 'videos/'
      ) || [];

      for (const file of videoFiles) {
        const pathParts = file.Key.split('/');
        if (pathParts.length >= 3) {
          const courseName = pathParts[1];
          const fileName = pathParts[pathParts.length - 1];
          const title = fileName.replace('.mp4', '');
          
          const videoUrl = `https://${this.bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${file.Key}`;
          
          const videoData = {
            videoId: fileName.split('-')[0] || Date.now().toString(),
            courseName,
            title: title.split('-').slice(1).join(' ') || title,
            description: `Video: ${title}`,
            videoUrl,
            s3Key: file.Key,
            watched: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          await dynamodb.saveVideo(videoData);
        }
      }

      console.log(`Synced ${videoFiles.length} videos from S3`);
      return videoFiles.length;
    } catch (error) {
      console.error('S3 sync error:', error.message);
      return 0;
    }
  }

  // Verify and repair course manifest links
  async verifyManifest(courseName) {
    try {
      const { ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
      const COURSES_TABLE = `video-course-app-courses-${environment}`;
      const VIDEOS_TABLE = `video-course-app-videos-${environment}`;
      
      console.log(`🔍 Auditing manifest for ${courseName} on table: ${COURSES_TABLE}`);
      
      const courseResult = await dynamodb.docClient.send(new ScanCommand({
        TableName: COURSES_TABLE,
        FilterExpression: "courseName = :courseName",
        ExpressionAttributeValues: { ":courseName": courseName }
      }));

      const course = courseResult.Items?.[0];
      if (!course) return { success: false, message: 'Course not found' };

      let itemsRepaired = 0;
      const sections = course.sections || [];
      
      for (const section of sections) {
        for (const lecture of section.lectures || []) {
          if (lecture.type === 'video') {
            const s3Key = (lecture.videoUrl || '').split('.com/')[1] || lecture.videoUrl;
            const exists = await this.checkS3Exists(s3Key);
            
            if (!exists) {
              const recovery = await this.findRecoveryVideo(lecture.title, courseName);
              if (recovery) {
                const newUrl = `https://${this.bucketName}.s3.amazonaws.com/${recovery.s3Key}`;
                lecture.videoUrl = newUrl;
                lecture.url = newUrl;
                lecture.fullVideoUrl = newUrl;
                lecture.videoId = recovery.videoId;
                itemsRepaired++;
              }
            }
          }
        }
      }

      if (itemsRepaired > 0) {
        await dynamodb.docClient.send(new UpdateCommand({
          TableName: COURSES_TABLE,
          Key: { courseName: course.courseName },
          UpdateExpression: "SET sections = :sections, updatedAt = :updatedAt",
          ExpressionAttributeValues: {
            ":sections": sections,
            ":updatedAt": new Date().toISOString()
          }
        }));
      }

      return { success: true, repairedCount: itemsRepaired };
    } catch (error) {
      console.error('Manifest verification error:', error);
      return { success: false, error: error.message };
    }
  }

  async checkS3Exists(key) {
    if (!key) return false;
    const { HeadObjectCommand } = require('@aws-sdk/client-s3');
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucketName, Key: key }));
      return true;
    } catch (error) {
      return false;
    }
  }

  async findRecoveryVideo(title, courseName) {
    const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
    const VIDEOS_TABLE = 'video-course-app-videos-prod';
    const result = await dynamodb.docClient.send(new ScanCommand({
      TableName: VIDEOS_TABLE,
      FilterExpression: "contains(title, :title)",
      ExpressionAttributeValues: { ":title": title.trim() }
    }));
    return result.Items?.[0] || null;
  }
}

module.exports = new S3SyncService();