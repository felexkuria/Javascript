const dynamoVideoService = require('../services/dynamoVideoService');

class SystemController {
  async healthCheck(req, res) {
    try {
      const dbStatus = await dynamoVideoService.healthCheck();
      res.json({ 
        status: 'healthy', 
        database: dbStatus,
        timestamp: new Date().toISOString() 
      });
    } catch (error) {
      res.status(500).json({ status: 'unhealthy', error: error.message });
    }
  }

  async getGamificationStats(req, res) {
    try {
      const userId = req.user?.email || req.session?.user?.email;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const gamificationData = await dynamoVideoService.getUserGamificationData(userId);
      res.json({ success: true, data: gamificationData });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getGamificationLoad(req, res) {
    try {
      const gamificationManager = require('../services/gamificationManager');
      const userId = req.user?.email || req.session?.user?.email;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
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
  }

  async syncGamification(req, res) {
    try {
      const { achievements, userStats, streakData } = req.body;
      const userId = req.user?.email || req.session?.user?.email;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const gamificationManager = require('../services/gamificationManager');
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
  }
}

module.exports = new SystemController();
