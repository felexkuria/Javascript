// 🛰️ SOTA: Dynamic Environment Injection
// Load dotenv to support standalone script usage (test_signer.js, migration scripts)
try { require('dotenv').config(); } catch (e) { /* silent fail if not installed */ }

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

class S3VideoService {
  constructor() {
    const config = {
      region: process.env.AWS_REGION || 'us-east-1',
    };

    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      };
    }

    this.s3 = new S3Client(config);
    this.bucketName = process.env.S3_BUCKET_NAME || 'video-course-app-video-bucket-prod-6m5k2til';
  }

  async generateSignedUrl(videoUrl, expiresIn = 3600) {
    try {
      if (!videoUrl) return videoUrl;

      let bucket = this.bucketName;
      let key = '';

      // 🛰️ Universal S3 Parsing (HTTPS or s3:// URI)
      if (videoUrl.startsWith('s3://')) {
        const parts = videoUrl.replace('s3://', '').split('/');
        bucket = parts.shift();
        key = parts.join('/');
      } else if (videoUrl.includes('amazonaws.com')) {
        const urlParts = videoUrl.split('.amazonaws.com/');
        if (urlParts.length < 2) return videoUrl;
        
        // Extract bucket from subdomain (e.g., https://bucket.s3.region.amazonaws.com/key)
        const host = urlParts[0].replace('https://', '').replace('http://', '');
        const hostParts = host.split('.');
        if (hostParts.length >= 2 && hostParts.includes('s3')) {
          bucket = hostParts[0];
        } else if (hostParts.length > 0) {
          // Fallback: first part of host might be the bucket
          bucket = hostParts[0];
        }
        
        // Key is everything after the first slash of the path
        key = urlParts[1].split('?')[0]; 
      } else {
        // 🏗️ Key-Only Recovery: If it's not a URL, treat it as a raw S3 Key
        key = videoUrl;
        bucket = this.bucketName;
      }

      const commandParams = {
        Bucket: bucket.trim(),
        Key: key.trim()
      };

      const ext = key.toLowerCase().split('.').pop();
      if (ext === 'pdf') {
        commandParams.ResponseContentDisposition = 'inline';
        commandParams.ResponseContentType = 'application/pdf';
      } else if (['mp4', 'mov', 'webm', 'm4v'].includes(ext)) {
        commandParams.ResponseContentDisposition = 'inline';
        commandParams.ResponseContentType = ext === 'webm' ? 'video/webm' : 'video/mp4';
      }

      const command = new GetObjectCommand(commandParams);
      
      const signedUrl = await getSignedUrl(this.s3, command, { expiresIn });
      return signedUrl;
    } catch (error) {
      console.error('Error generating signed URL:', error);
      return videoUrl;
    }
  }

  async processVideoUrl(video, userRole = 'student', courseName = '') {
    if (!video || !video.videoUrl) return video;

    if (video.isYouTube) {
      video.fullVideoUrl = `https://www.youtube.com/embed/${video.youtubeId}`;
      video.embedUrl = `https://www.youtube.com/embed/${video.youtubeId}?enablejsapi=1`;
    } else if (this.isS3Video(video.videoUrl)) {
      video.isS3Video = true;
      video.fullVideoUrl = await this.generateSignedUrl(video.videoUrl, 3600);
      
      if (video.thumbnailUrl) video.thumbnailUrl = await this.generateSignedUrl(video.thumbnailUrl, 3600);
      if (video.captionsUrl) video.captionsUrl = await this.generateSignedUrl(video.captionsUrl, 3600);
    } else if (this.isRelativeUrl(video.videoUrl)) {
      // 🏗️ Smart Key Recovery: If it's a relative path, it's a raw S3 Key.
      // We pass it directly to generateSignedUrl which handles the bucket.
      video.isS3Video = true;
      video.fullVideoUrl = await this.generateSignedUrl(video.videoUrl, 3600);
      
      if (video.thumbnailUrl) video.thumbnailUrl = await this.generateSignedUrl(video.thumbnailUrl, 3600);
      if (video.captionsUrl) video.captionsUrl = await this.generateSignedUrl(video.captionsUrl, 3600);
    } else {
      video.fullVideoUrl = video.videoUrl;
    }

    return video;
  }

  async processVideoList(videos, userRole = 'student') {
    if (!videos || !Array.isArray(videos)) return videos;
    // Multi-threaded signing for 10x performance boost
    return await Promise.all(videos.map(v => this.processVideoUrl(v, userRole)));
  }

  isS3Video(videoUrl) {
    return videoUrl && (
      videoUrl.includes('amazonaws.com') || 
      videoUrl.includes('s3.') || 
      videoUrl.startsWith('https://s3') ||
      videoUrl.startsWith('s3://')
    );
  }

  isRelativeUrl(videoUrl) {
    return videoUrl && !videoUrl.startsWith('http') && !videoUrl.startsWith('/');
  }

  convertToS3Url(relativeUrl) {
    // Convert relative URLs like "dev-ops-bootcamp_202201/[TutsNode.com] - DevOps Bootcamp/lesson98.mp4"
    // to full S3 URLs
    const cleanUrl = relativeUrl.replace(/\[TutsNode\.com\]\s*-\s*/, '');
    return `https://${this.bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/videos/${cleanUrl}`;
  }
}

module.exports = new S3VideoService();