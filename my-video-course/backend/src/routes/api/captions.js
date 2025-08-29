const express = require('express');
const router = express.Router();
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { srtToVtt } = require('../utils/captionConverter');
const dynamoVideoService = require('../services/dynamoVideoService');

const s3Client = new S3Client({ region: process.env.AWS_REGION });

// Generate VTT captions from S3 video
router.get('/vtt/:courseName/:videoTitle', async (req, res) => {
  try {
    const { courseName, videoTitle } = req.params;
    
    // Check if VTT already exists in S3
    const vttKey = `captions/${courseName}/${videoTitle}.vtt`;
    
    try {
      const vttUrl = await getSignedUrl(s3Client, new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: vttKey
      }), { expiresIn: 3600 });
      
      return res.redirect(vttUrl);
    } catch (error) {
      // VTT doesn't exist, check for SRT and convert
      const srtKey = `captions/${courseName}/${videoTitle}.srt`;
      
      try {
        const srtResponse = await s3Client.send(new GetObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: srtKey
        }));
        
        const srtContent = await srtResponse.Body.transformToString();
        const vttContent = srtToVtt(srtContent);
        
        // Save VTT to S3
        await s3Client.send(new PutObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: vttKey,
          Body: vttContent,
          ContentType: 'text/vtt'
        }));
        
        res.setHeader('Content-Type', 'text/vtt');
        return res.send(vttContent);
      } catch (srtError) {
        // Neither VTT nor SRT exists, trigger generation
        triggerCaptionGeneration(courseName, videoTitle);
      }
    }
    
    // Return empty VTT for now
    res.setHeader('Content-Type', 'text/vtt');
    res.send('WEBVTT\n\n');
    
  } catch (error) {
    console.error('Caption error:', error);
    res.status(500).send('Caption generation failed');
  }
});

async function triggerCaptionGeneration(courseName, videoTitle) {
  const videos = await dynamoVideoService.getVideosForCourse(courseName);
  const video = videos.find(v => v.title === videoTitle);
  
  if (video && video.videoUrl) {
    console.log(`Triggering caption generation for: ${video.videoUrl}`);
    
    // Send request to EC2 instance
    try {
      const response = await fetch('http://localhost:8080/generate-captions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: video.videoUrl,
          courseName,
          videoTitle,
          s3Bucket: process.env.S3_BUCKET_NAME
        })
      });
      
      if (response.ok) {
        console.log('Caption generation triggered successfully');
      }
    } catch (error) {
      console.error('Failed to trigger caption generation:', error);
    }
  }
}

module.exports = router;