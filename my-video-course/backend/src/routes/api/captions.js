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
    
    // Try multiple caption file naming patterns
    const possibleKeys = [
      `videos/${courseName}/${videoFilename}.vtt`,
      `captions/${courseName}/${videoFilename}.vtt`,
      `captions/${courseName}/${videoId}.vtt`
    ];
    
    // For lesson1, try the known timestamp version
    if (videoFilename === 'lesson1') {
      possibleKeys.push(`videos/${courseName}/lesson1__1756579046.vtt`);
    }
    
    // Try common timestamp patterns
    possibleKeys.push(`videos/${courseName}/${videoFilename}__1756579046.vtt`);
    possibleKeys.push(`videos/${courseName}/${videoFilename}__1756575209.vtt`);
    possibleKeys.push(`videos/${courseName}/${videoFilename}__1756585495.vtt`);
    
    // Try to find existing VTT file
    for (const vttKey of possibleKeys) {
      try {
        const vttUrl = await getSignedUrl(s3Client, new GetObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: vttKey
        }), { expiresIn: 3600 });
        
        return res.redirect(vttUrl);
      } catch (error) {
        continue; // Try next key
      }
    }
    
    // No VTT found, try SRT files
    const possibleSrtKeys = [
      `videos/${courseName}/${videoFilename}.srt`,
      `captions/${courseName}/${videoFilename}.srt`,
      `captions/${courseName}/${videoId}.srt`
    ];
    
    for (const srtKey of possibleSrtKeys) {
      try {
        const srtResponse = await s3Client.send(new GetObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: srtKey
        }));
        
        const srtContent = await srtResponse.Body.transformToString();
        const vttContent = srtToVtt(srtContent);
        
        // Save VTT to S3 using video ID
        const newVttKey = `captions/${courseName}/${videoId}.vtt`;
        await s3Client.send(new PutObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: newVttKey,
          Body: vttContent,
          ContentType: 'text/vtt'
        }));
        
        res.setHeader('Content-Type', 'text/vtt');
        return res.send(vttContent);
      } catch (srtError) {
        continue; // Try next SRT key
      }
    }
    
    // No captions found, trigger generation
    triggerCaptionGeneration(courseName, video.title, videoId);
    
    // Return empty VTT for now
    res.setHeader('Content-Type', 'text/vtt');
    res.send('WEBVTT\n\n');
    
  } catch (error) {
    console.error('Caption error:', error);
    res.status(500).send('Caption generation failed');
  }
});

async function triggerCaptionGeneration(courseName, videoTitle, videoId) {
  const videos = await dynamoVideoService.getVideosForCourse(courseName);
  const video = videos.find(v => v._id && v._id.toString() === videoId);
  
  if (video && video.videoUrl) {
    console.log(`Triggering caption generation for: ${video.videoUrl}`);
    
    // Send request to EC2 instance
    try {
      const response = await fetch('http://localhost:8081/generate-captions', {
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