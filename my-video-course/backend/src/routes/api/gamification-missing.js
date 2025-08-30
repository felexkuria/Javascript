const express = require('express');
const router = express.Router();

// Missing gamification endpoints
router.get('/load', async (req, res) => {
  try {
    const userId = req.user?.email || 'guest';
    const dynamoVideoService = require('../../services/dynamoVideoService');
    const gamificationData = await dynamoVideoService.getUserGamificationData(userId);
    
    res.json({
      success: true,
      data: gamificationData || {
        userStats: {
          totalPoints: 0,
          currentLevel: 1,
          videosWatched: {},
          coursesCompleted: 0
        },
        achievements: [],
        streakData: {
          currentStreak: 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;