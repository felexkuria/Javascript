const express = require('express');
const router = express.Router();
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { srtToVtt } = require('../../utils/captionConverter');
const dynamoVideoService = require('../../services/dynamoVideoService');

const s3Client = new S3Client({ region: process.env.AWS_REGION });

// Generate VTT captions from S3 video
router.get('/vtt/:courseName/:videoId', async (req, res) => {
  try {
    const { courseName, videoId } = req.params;
    
    // Get video details from database
    const videos = await dynamoVideoService.getVideosForCourse(courseName);
    const video = videos.find(v => v._id && v._id.toString() === videoId);
    
    if (!video) {
      return res.status(404).send('Video not found');
    }
    
    // Extract filename from video URL/key for caption matching
    let videoFilename = videoId;
    if (video.s3Key) {
      videoFilename = video.s3Key.split('/').pop().replace('.mp4', '');
    } else if (video.videoUrl) {
      videoFilename = video.videoUrl.split('/').pop().replace('.mp4', '');
    }
    
    // Try multiple caption file naming patterns in S3
    const possibleKeys = [
      `videos/${videoFilename}.vtt`,
      `videos/${videoFilename}.srt`,
      `videos/${courseName}/${videoFilename}.vtt`,
      `videos/${courseName}/${videoFilename}.srt`,
      `captions/${videoFilename}.vtt`,
      `captions/${videoFilename}.srt`,
      `captions/${courseName}/${videoFilename}.vtt`,
      `captions/${courseName}/${videoFilename}.srt`,
      `captions/${courseName}/${videoId}.vtt`,
      `captions/${courseName}/${videoId}.srt`
    ];
    
    // Add timestamp patterns for dev-ops-bootcamp
    if (courseName.includes('dev-ops-bootcamp')) {
      const timestamps = ['1756578844', '1756579046', '1756575209', '1756585495'];
      timestamps.forEach(ts => {
        possibleKeys.push(`videos/${videoFilename}__${ts}.vtt`);
        possibleKeys.push(`videos/${videoFilename}__${ts}.srt`);
        possibleKeys.push(`videos/${courseName}/${videoFilename}__${ts}.vtt`);
        possibleKeys.push(`videos/${courseName}/${videoFilename}__${ts}.srt`);
      });
    }
    
    // Check DynamoDB cache first
    const cachedCaption = await dynamoVideoService.getCachedCaption(courseName, videoId);
    if (cachedCaption) {
      res.setHeader('Content-Type', 'text/vtt');
      return res.send(cachedCaption);
    }
    
    // Try to find caption files in S3
    for (const captionKey of possibleKeys) {
      try {
        const response = await s3Client.send(new GetObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: captionKey
        }));
        
        const content = await response.Body.transformToString();
        let vttContent = content;
        
        if (captionKey.endsWith('.srt')) {
          vttContent = srtToVtt(content);
        }
        
        // Cache in DynamoDB for faster future loading
        await dynamoVideoService.cacheCaption(courseName, videoId, vttContent);
        
        res.setHeader('Content-Type', 'text/vtt');
        return res.send(vttContent);
      } catch (error) {
        continue; // Try next key
      }
    }
    
    // No captions found in S3, return empty VTT
    res.setHeader('Content-Type', 'text/vtt');
    res.send('WEBVTT\n\n');
    
  } catch (error) {
    console.error('Caption error:', error);
    res.status(500).send('Caption generation failed');
  }
});



module.exports = router;