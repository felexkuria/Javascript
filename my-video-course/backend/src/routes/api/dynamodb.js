const express = require('express');
const router = express.Router();
const dynamoVideoService = require('../../services/dynamoVideoService');

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const status = await dynamoVideoService.healthCheck();
    res.json({
      success: true,
      data: status,
      message: 'Health check completed'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Health check failed',
      error: error.message
    });
  }
});

// Migration endpoint
router.post('/migrate', async (req, res) => {
  try {
    console.log('🔄 Starting DynamoDB migration via API...');
    
    const success = await dynamoVideoService.migrateToDatabase();
    
    if (success) {
      res.json({
        success: true,
        message: 'Migration to DynamoDB completed successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Migration to DynamoDB failed'
      });
    }
  } catch (error) {
    console.error('Migration API error:', error);
    res.status(500).json({
      success: false,
      message: 'Migration failed',
      error: error.message
    });
  }
});

// Get all courses from DynamoDB
router.get('/courses', async (req, res) => {
  try {
    const courses = await dynamoVideoService.getAllCourses();
    res.json({
      success: true,
      data: courses,
      message: 'Courses retrieved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve courses',
      error: error.message
    });
  }
});

// Get videos for a specific course
router.get('/courses/:courseName/videos', async (req, res) => {
  try {
    const courseName = decodeURIComponent(req.params.courseName);
    const videos = await dynamoVideoService.getVideosForCourse(courseName);
    
    res.json({
      success: true,
      data: videos,
      message: 'Videos retrieved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve videos',
      error: error.message
    });
  }
});

// Update video watch status
router.post('/courses/:courseName/videos/:videoId/watch', async (req, res) => {
  try {
    const courseName = decodeURIComponent(req.params.courseName);
    const videoId = req.params.videoId;
    const { watched = true } = req.body;
    
    const success = await dynamoVideoService.updateVideoWatchStatus(courseName, videoId, watched);
    
    if (success) {
      res.json({
        success: true,
        message: 'Video watch status updated successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to update video watch status'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update video watch status',
      error: error.message
    });
  }
});

// Get user gamification data
router.get('/gamification/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId || 'default_user';
    const data = await dynamoVideoService.getUserGamificationData(userId);
    
    res.json({
      success: true,
      data: data,
      message: 'Gamification data retrieved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve gamification data',
      error: error.message
    });
  }
});

// Update user gamification data
router.post('/gamification/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId || 'default_user';
    const data = req.body;
    
    const success = await dynamoVideoService.updateUserGamificationData(userId, data);
    
    if (success) {
      res.json({
        success: true,
        message: 'Gamification data updated successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to update gamification data'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update gamification data',
      error: error.message
    });
  }
});

module.exports = router;