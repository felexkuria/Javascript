const express = require('express');
const router = express.Router();
const s3VideoService = require('../../services/s3VideoService');

router.get('/:courseName/:videoId', async (req, res) => {
  try {
    const { courseName, videoId } = req.params;
    const dynamoVideoService = require('../../services/dynamoVideoService');
    const https = require('https');
    
    const video = await dynamoVideoService.getVideoById(courseName, videoId);
    if (!video || !video.videoUrl) {
      return res.status(404).send('Video not found');
    }

    if (s3VideoService.isS3Video(video.videoUrl)) {
      const signedUrl = await s3VideoService.generateSignedUrl(video.videoUrl, 3600);
      
      // Stream video from S3
      const request = https.get(signedUrl, (s3Response) => {
        res.set({
          'Content-Type': 'video/mp4',
          'Content-Length': s3Response.headers['content-length'],
          'Accept-Ranges': 'bytes'
        });
        s3Response.pipe(res);
      });
      
      request.on('error', () => res.status(500).send('Stream error'));
      return;
    }

    res.status(400).send('Not an S3 video');
  } catch (error) {
    console.error('Video proxy error:', error);
    res.status(500).send('Server error');
  }
});

module.exports = router;