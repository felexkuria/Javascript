const express = require('express');
const router = express.Router();
const aiService = require('../../services/aiService');
const dynamoVideoService = require('../../services/dynamoVideoService');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({ region: process.env.AWS_REGION });

// Generate quiz for video
router.get('/quiz/:courseName/:videoId', async (req, res) => {
  try {
    const { courseName, videoId } = req.params;
    
    // Check cache first
    const cached = await dynamoVideoService.getCachedLearningContent(courseName, videoId, 'quiz');
    if (cached) {
      return res.json({ success: true, quiz: JSON.parse(cached) });
    }
    
    const videos = await dynamoVideoService.getVideosForCourse(courseName);
    const video = videos.find(v => v._id && v._id.toString() === videoId);
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    let srtContent = '';
    if (video.s3CaptionKey) {
      try {
        const response = await s3Client.send(new GetObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: video.s3CaptionKey
        }));
        srtContent = await response.Body.transformToString();
      } catch (error) {
        console.log('No SRT found, using title only');
      }
    }

    const quiz = srtContent 
      ? await aiService.generateQuizFromSRT(srtContent, video.title)
      : await aiService.generateQuizFromVideo(video.title);

    // Cache the result
    await dynamoVideoService.cacheLearningContent(courseName, videoId, 'quiz', quiz);

    res.json({ success: true, quiz });
  } catch (error) {
    console.error('Quiz generation error:', error);
    res.status(500).json({ error: 'Failed to generate quiz' });
  }
});

// Generate todo list for video
router.get('/todo/:courseName/:videoId', async (req, res) => {
  try {
    const { courseName, videoId } = req.params;
    
    // Check cache first
    const cached = await dynamoVideoService.getCachedLearningContent(courseName, videoId, 'todo');
    if (cached) {
      return res.json({ success: true, todo: JSON.parse(cached) });
    }
    
    const videos = await dynamoVideoService.getVideosForCourse(courseName);
    const video = videos.find(v => v._id && v._id.toString() === videoId);
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    let srtContent = '';
    if (video.s3CaptionKey) {
      try {
        const response = await s3Client.send(new GetObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: video.s3CaptionKey
        }));
        srtContent = await response.Body.transformToString();
      } catch (error) {
        console.log('No SRT found, using title only');
      }
    }

    const todo = srtContent 
      ? await aiService.generateTodoFromSRT(srtContent, video.title)
      : await aiService.generateTodoFromVideo(video.title);

    // Cache the result
    await dynamoVideoService.cacheLearningContent(courseName, videoId, 'todo', todo);

    res.json({ success: true, todo });
  } catch (error) {
    console.error('Todo generation error:', error);
    res.status(500).json({ error: 'Failed to generate todo list' });
  }
});

// Generate summary for video
router.get('/summary/:courseName/:videoId', async (req, res) => {
  try {
    const { courseName, videoId } = req.params;
    
    // Check cache first
    const cached = await dynamoVideoService.getCachedLearningContent(courseName, videoId, 'summary');
    if (cached) {
      return res.json({ success: true, summary: JSON.parse(cached) });
    }
    
    const videos = await dynamoVideoService.getVideosForCourse(courseName);
    const video = videos.find(v => v._id && v._id.toString() === videoId);
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    let summary = `Summary for: ${video.title}`;
    if (video.s3CaptionKey) {
      try {
        const response = await s3Client.send(new GetObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: video.s3CaptionKey
        }));
        const srtContent = await response.Body.transformToString();
        summary = await aiService.summarizeFromSRT(srtContent, video.title);
      } catch (error) {
        console.log('No SRT found, using title only');
      }
    }

    // Cache the result
    await dynamoVideoService.cacheLearningContent(courseName, videoId, 'summary', summary);

    res.json({ success: true, summary });
  } catch (error) {
    console.error('Summary generation error:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

module.exports = router;