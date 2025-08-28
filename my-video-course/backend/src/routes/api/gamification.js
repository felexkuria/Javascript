const express = require('express');
const router = express.Router();
const gamificationManager = require('../../services/gamificationManager');

router.get('/stats', async (req, res) => {
  try {
    const userId = req.query.userId || 'default_user';
    const userData = await gamificationManager.getUserData(userId);
    res.json({ 
      success: true, 
      data: userData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const { achievements, userStats, streakData } = req.body;
    const userId = 'default_user';

    const updates = {
      achievements: achievements || [],
      stats: userStats || {},
      streak: streakData?.currentStreak || 0
    };

    await gamificationManager.updateUserData(userId, updates);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;