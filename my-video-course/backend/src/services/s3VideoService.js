const { S3Client } = require('@aws-sdk/client-s3');

class S3VideoService {
  constructor() {
    this.s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    this.bucketName = process.env.S3_BUCKET_NAME;
  }

  generateSignedUrl(videoUrl, expiresIn = 3600) {
    try {
      if (!videoUrl || !videoUrl.includes('amazonaws.com')) {
        return videoUrl;
      }

      const urlParts = videoUrl.split('.amazonaws.com/');
      if (urlParts.length < 2) return videoUrl;

      const key = urlParts[1];
      const signedUrl = this.s3.getSignedUrl('getObject', {
        Bucket: this.bucketName,
        Key: key,
        Expires: expiresIn
      });
      
      return signedUrl;
    } catch (error) {
      console.error('Error generating signed URL:', error);
      return videoUrl;
    }
  }

  processVideoUrl(video, userRole = 'student', courseName = '') {
    if (!video.videoUrl) return video;

    if (video.isYouTube) {
      video.fullVideoUrl = `https://www.youtube.com/embed/${video.youtubeId}`;
      video.embedUrl = `https://www.youtube.com/embed/${video.youtubeId}?enablejsapi=1`;
    } else if (this.isS3Video(video.videoUrl)) {
      video.isS3Video = true;
      video.fullVideoUrl = `/api/video-proxy/${courseName}/${video._id}`;
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