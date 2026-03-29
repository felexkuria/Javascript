const express = require('express');
const router = express.Router();
const dynamoVideoService = require('../../services/dynamoVideoService');

// Get quizzes for specific video
router.get('/:videoId', async (req, res) => {
  try {
    const userId = req.user?.email || 'guest';
    const videoId = req.params.videoId;
    
    const courseName = req.query.courseName; // Passed via query for active ingestion
    
    // Try to get quiz from DynamoDB first
    const quiz = await getQuizForVideo(videoId, userId, courseName);
    
    if (quiz) {
      res.json({ success: true, quiz });
    } else {
      res.json({ success: false, message: 'No quiz found for this video' });
    }
  } catch (error) {
    console.error('Error fetching quiz for video:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all quizzes
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.email || 'guest';
    const quizzes = await getAllQuizzes(userId);
    res.json({ success: true, quizzes });
  } catch (error) {
    console.error('Error fetching quizzes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function getQuizForVideo(videoId, userId, courseName = null) {
  // Check DynamoDB for quiz data
  const dynamodb = require('../../utils/dynamodb');
  const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
  
  if (dynamodb.isAvailable()) {
    try {
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
      const params = {
        TableName: `video-course-quizzes-${environment}`,
        FilterExpression: 'videoId = :videoId',
        ExpressionAttributeValues: { ':videoId': videoId }
      };
      
      const result = await dynamodb.docClient.send(new ScanCommand(params));
      if (result.Items && result.Items.length > 0) {
        return result.Items[0].questions;
      }
    } catch (error) {
      console.log('DynamoDB quiz lookup failed');
    }
  }
  
  // 🚀 ACTIVE INGESTION: If missing and we have courseName, try generating!
  if (courseName) {
    try {
      const srtQuizGenerator = require('../../services/srtQuizGenerator');
      const dynamoVideoService = require('../../services/dynamoVideoService');
      const path = require('path');
      const fs = require('fs');
      
      const video = await dynamoVideoService.getVideoById(courseName, videoId);
      if (video && video.videoUrl && !video.isYouTube) {
        const videoPath = path.join(__dirname, '../../../../frontend/public/videos', video.videoUrl);
        if (fs.existsSync(videoPath)) {
          console.log(`📡 Ingesting quiz for: ${video.title}`);
          const srtPath = await srtQuizGenerator.generateSRT(videoPath);
          const srtEntries = srtQuizGenerator.parseSRT(srtPath);
          if (srtEntries && srtEntries.length > 5) {
            const questions = await srtQuizGenerator.generateQuestions(srtEntries, video.title);
            if (questions && questions.length > 0) {
              return questions;
            }
          }
        }
      }
    } catch (genError) {
      console.warn('Active quiz ingestion failed:', genError.message);
    }
  }
  
  // Fallback to localStorage quiz mapping
  const fs = require('fs');
  const path = require('path');
  const quizMappingPath = path.join(__dirname, '../../../data/videoQuizMapping.json');
  
  try {
    if (fs.existsSync(quizMappingPath)) {
      const mapping = JSON.parse(fs.readFileSync(quizMappingPath, 'utf8'));
      return mapping[videoId] || null;
    }
  } catch (error) {}
  
  return null;
}

async function getAllQuizzes(userId) {
  // Return default quizzes organized by topic
  return {
    'terraform': [
      {
        id: 'tf_1',
        question: 'What is the primary purpose of Terraform?',
        options: ['Container orchestration', 'Infrastructure as Code', 'Application deployment', 'Database management'],
        correct: 1,
        explanation: 'Terraform is an Infrastructure as Code tool that allows you to define and provision infrastructure using declarative configuration files.'
      }
    ]
  };
}

// Submit quiz results
router.post('/complete', async (req, res) => {
  try {
    const userId = req.user?.email || 'guest';
    const { videoId, score, totalQuestions } = req.body;
    
    const result = await dynamoVideoService.recordQuizCompletion(userId, score, totalQuestions);
    res.json({ success: true, userStats: result.userStats });
  } catch (error) {
    console.error('Quiz completion error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Submit lab results
router.post('/lab/complete', async (req, res) => {
  try {
    const userId = req.user?.email || 'guest';
    const { labId, points } = req.body;
    
    const result = await dynamoVideoService.recordLabCompletion(userId, labId, points);
    res.json({ success: true, userStats: result.userStats });
  } catch (error) {
    console.error('Lab completion error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;