const express = require('express');
const router = express.Router();
const dynamoVideoService = require('../../services/dynamoVideoService');

// Get quizzes for specific video
router.get('/:videoId', async (req, res) => {
  try {
    const userId = req.user?.email || 'guest';
    const videoId = req.params.videoId;
    
    // Try to get quiz from DynamoDB first
    const quiz = await getQuizForVideo(videoId, userId);
    
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

async function getQuizForVideo(videoId, userId) {
  // Check DynamoDB for quiz data
  const dynamodb = require('../../utils/dynamodb');
  if (dynamodb.isAvailable()) {
    try {
      // Query quiz table by videoId
      const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
      
      const params = {
        TableName: `video-course-quizzes-${environment}`,
        FilterExpression: 'videoId = :videoId',
        ExpressionAttributeValues: {
          ':videoId': videoId
        }
      };
      
      const result = await dynamodb.docClient.send(new ScanCommand(params));
      if (result.Items && result.Items.length > 0) {
        return result.Items[0].questions;
      }
    } catch (error) {
      console.log('DynamoDB quiz lookup failed, checking localStorage');
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
  } catch (error) {
    console.error('Error reading quiz mapping:', error);
  }
  
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

module.exports = router;