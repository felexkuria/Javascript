const express = require('express');
const router = express.Router();
const dynamoVideoService = require('../../services/dynamoVideoService');
const dynamodb = require('../../utils/dynamodb');

/**
 * POST /api/migrate/localStorage
 * Receive localStorage data from frontend and migrate to DynamoDB
 */
router.post('/localStorage', async (req, res) => {
  try {
    const { courses, userProgress, gamification, metadata } = req.body;
    const targetEmail = 'engineerfelex@gmail.com'; // Default user
    
    console.log('📥 Received localStorage migration request for DynamoDB');
    
    // 1. Migrate user and gamification data
    let user = await dynamodb.getUser(targetEmail);
    if (!user) {
      user = {
        userId: targetEmail,
        name: 'Felix Engineer',
        email: targetEmail,
        roles: ['student'],
        createdAt: new Date().toISOString()
      };
    }
    
    // Merge gamification data if provided
    let gamData = null;
    if (gamification && Object.keys(gamification).length > 0) {
      gamData = Object.values(gamification)[0];
    }
    
    await dynamodb.saveUser(user);
    if (gamData) {
      await dynamodb.saveGamificationData(targetEmail, gamData);
    }
    
    // 2. Migrate course/video data
    if (courses) {
      await dynamodb.migrateFromLocalStorage(courses, gamification || {});
    }
    
    res.json({
      success: true,
      message: 'Data migrated to DynamoDB successfully',
      data: {
        user: { email: targetEmail },
        migrationMetadata: metadata
      }
    });
    
  } catch (error) {
    console.error('❌ DynamoDB Migration API error:', error);
    res.status(500).json({
      success: false,
      message: 'Migration failed',
      error: error.message
    });
  }
});

/**
 * GET /api/migrate/status
 */
router.get('/status/:email?', async (req, res) => {
  try {
    const email = req.params.email || 'engineerfelex@gmail.com';
    const user = await dynamodb.getUser(email);
    const gamification = await dynamodb.getGamificationData(email);
    
    res.json({
      success: true,
      migrated: !!user,
      data: {
        user: user ? {
          email: user.email,
          name: user.name,
          totalPoints: gamification?.userStats?.totalPoints || 0
        } : null
      }
    });
    
  } catch (error) {
    console.error('❌ Status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Status check failed',
      error: error.message
    });
  }
});

module.exports = router;
router;