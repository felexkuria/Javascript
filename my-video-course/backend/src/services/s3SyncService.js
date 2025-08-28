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
            _id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            courseName,
            title,
            description: `Video: ${title}`,
            videoUrl,
            s3Key: file.Key,
            watched: false,
            createdAt: new Date().toISOString()
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
}

module.exports = new S3SyncService();