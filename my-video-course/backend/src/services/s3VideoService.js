const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

class S3VideoService {
  constructor() {
    this.s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    this.bucketName = process.env.S3_BUCKET_NAME;
  }

  async generateSignedUrl(videoUrl, expiresIn = 3600) {
    try {
      if (!videoUrl || !videoUrl.includes('amazonaws.com')) {
        return videoUrl;
      }

      const urlParts = videoUrl.split('.amazonaws.com/');
      if (urlParts.length < 2) return videoUrl;

      const key = urlParts[1];
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });
      
      const signedUrl = await getSignedUrl(this.s3, command, { expiresIn });
      return signedUrl;
    } catch (error) {
      console.error('Error generating signed URL:', error);
      return videoUrl;
    }
  }

  async processVideoUrl(video, userRole = 'student', courseName = '') {
    if (!video.videoUrl) return video;

    if (video.isYouTube) {
      video.fullVideoUrl = `https://www.youtube.com/embed/${video.youtubeId}`;
      video.embedUrl = `https://www.youtube.com/embed/${video.youtubeId}?enablejsapi=1`;
    } else if (this.isS3Video(video.videoUrl)) {
      video.isS3Video = true;
      // Generate direct signed URL for video element
      video.fullVideoUrl = await this.generateSignedUrl(video.videoUrl, 3600);
    } else {
      video.fullVideoUrl = video.videoUrl;
    }

    return video;
  }

  isS3Video(videoUrl) {
    return videoUrl && (
      videoUrl.includes('amazonaws.com') || 
      videoUrl.includes('s3.') || 
      videoUrl.startsWith('https://s3')
    );
  }
}

module.exports = new S3VideoService();