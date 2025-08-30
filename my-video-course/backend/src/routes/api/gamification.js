const express = require('express');
const router = express.Router();
const gamificationManager = require('../../services/gamificationManager');

router.get('/stats', async (req, res) => {
  try {
    const userId = req.user?.email || req.session?.user?.email || req.query.userId || 'default_user';
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
    const userId = req.user?.email || req.session?.user?.email || 'default_user';

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

router.get('/load', async (req, res) => {
  try {
    const userId = req.user?.email || req.session?.user?.email || req.query.userId || 'default_user';
    const userData = await gamificationManager.getUserData(userId);
    res.json({
      success: true,
      achievements: userData.achievements || [],
      userStats: userData.stats || {},
      streakData: { currentStreak: userData.streak || 0 }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/keyboard-shortcut', async (req, res) => {
  try {
    const userId = req.user?.email || req.session?.user?.email || 'default_user';
    const { action } = req.body;
    
    let points = 0;
    let reason = '';
    
    switch (action) {
      case 'play_pause':
        points = 5;
        reason = 'using play/pause shortcut';
        break;
      case 'seek_forward':
        points = 3;
        reason = 'using seek forward shortcut';
        break;
      case 'seek_backward':
        points = 3;
        reason = 'using seek backward shortcut';
        break;
      case 'fullscreen':
        points = 5;
        reason = 'using fullscreen shortcut';
        break;
      case 'speed_change':
        points = 10;
        reason = 'changing playback speed';
        break;
      default:
        points = 2;
        reason = 'using keyboard shortcut';
    }
    
    const userData = await gamificationManager.awardPoints(userId, points, reason);
    res.json({ 
      success: true, 
      points: userData.totalPoints,
      level: userData.level,
      awarded: points
    });
  } catch (error) {
    console.error('Keyboard shortcut gamification error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;