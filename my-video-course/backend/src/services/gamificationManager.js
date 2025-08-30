const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

class GamificationManager {
  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data');
    this.gamificationFile = path.join(this.dataDir, 'gamification.json');
    this.ensureDataDir();
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.gamificationFile)) {
      fs.writeFileSync(this.gamificationFile, JSON.stringify({}), 'utf8');
    }
  }

  async getUserData(userId = 'default_user') {
    // Use DynamoDB service for production
    const dynamoService = require('../utils/dynamodb');
    if (dynamoService.isAvailable()) {
      try {
        const userData = await dynamoService.getGamificationData(userId);
        if (userData) {
          return userData;
        }
      } catch (error) {
        console.error('DynamoDB gamification read error:', error);
      }
    }
    // Try MongoDB first
    if (mongoose.connection.readyState === 1) {
      try {
        const collection = mongoose.connection.collection('gamification');
        const data = await collection.findOne({ userId });
        if (data) return data;
      } catch (error) {
        console.error('MongoDB gamification read error:', error);
      }
    }

    // Fallback to local file
    try {
      const data = JSON.parse(fs.readFileSync(this.gamificationFile, 'utf8'));
      return data[userId] || this.getDefaultUserData(userId);
    } catch (error) {
      return this.getDefaultUserData();
    }
  }

  getDefaultUserData(userId = 'default_user') {
    return {
      userId: userId,
      level: 1,
      totalPoints: 0,
      streak: 0,
      achievements: [],
      stats: {
        videosWatched: 0,
        coursesCompleted: 0,
        quizzesTaken: 0,
        perfectQuizzes: 0,
        studyDays: 0
      },
      badges: [],
      lastActivity: null,
      createdAt: new Date().toISOString()
    };
  }

  async updateUserData(userId, updates) {
    const userData = await this.getUserData(userId);
    const updatedData = { ...userData, ...updates, updatedAt: new Date().toISOString() };

    // Save to DynamoDB first (production)
    const dynamoService = require('../utils/dynamodb');
    if (dynamoService.isAvailable()) {
      try {
        await dynamoService.saveGamificationData(userId, updatedData);
      } catch (error) {
        console.error('DynamoDB gamification save error:', error);
      }
    }

    // Save to MongoDB as backup
    if (mongoose.connection.readyState === 1) {
      try {
        const collection = mongoose.connection.collection('gamification');
        await collection.updateOne(
          { userId },
          { $set: updatedData },
          { upsert: true }
        );
      } catch (error) {
        console.error('MongoDB gamification save error:', error);
      }
    }

    // Save to local file as fallback
    try {
      const allData = JSON.parse(fs.readFileSync(this.gamificationFile, 'utf8'));
      allData[userId] = updatedData;
      fs.writeFileSync(this.gamificationFile, JSON.stringify(allData, null, 2));
    } catch (error) {
      console.error('Local gamification save error:', error);
    }

    return updatedData;
  }

  async awardPoints(userId, points, reason) {
    const userData = await this.getUserData(userId);
    const newTotal = userData.totalPoints + points;
    const newLevel = Math.floor(newTotal / 1000) + 1;

    const updates = {
      totalPoints: newTotal,
      level: newLevel,
      lastActivity: new Date().toISOString()
    };

    // Check for level up achievement
    if (newLevel > userData.level) {
      updates.achievements = [...(userData.achievements || []), {
        id: `level_${newLevel}`,
        title: `Level ${newLevel} Reached!`,
        description: `You've reached level ${newLevel}`,
        earnedAt: new Date().toISOString(),
        points: 100
      }];
    }

    console.log(`🎯 Awarded ${points} points to ${userId} for ${reason}`);
    return await this.updateUserData(userId, updates);
  }

  async recordVideoWatch(userId, courseName, videoTitle) {
    const userData = await this.getUserData(userId);
    const stats = userData.stats || {};
    
    const updates = {
      stats: {
        ...stats,
        videosWatched: (stats.videosWatched || 0) + 1
      }
    };

    // Award points for watching video
    await this.awardPoints(userId, 50, `watching ${videoTitle}`);
    
    return await this.updateUserData(userId, updates);
  }

  async recordQuizCompletion(userId, score, totalQuestions) {
    const userData = await this.getUserData(userId);
    const stats = userData.stats || {};
    const percentage = (score / totalQuestions) * 100;
    
    let points = Math.round(percentage * 2); // Up to 200 points for perfect quiz
    
    const updates = {
      stats: {
        ...stats,
        quizzesTaken: (stats.quizzesTaken || 0) + 1,
        perfectQuizzes: percentage === 100 ? (stats.perfectQuizzes || 0) + 1 : (stats.perfectQuizzes || 0)
      }
    };

    // Perfect quiz achievement
    if (percentage === 100) {
      const perfectAchievement = {
        id: `perfect_quiz_${Date.now()}`,
        title: 'Perfect Score!',
        description: 'Got 100% on a quiz',
        earnedAt: new Date().toISOString(),
        points: 100
      };
      
      updates.achievements = [...(userData.achievements || []), perfectAchievement];
      points += 100; // Bonus points for perfect score
    }

    await this.awardPoints(userId, points, `quiz completion (${percentage}%)`);
    return await this.updateUserData(userId, updates);
  }

  async updateStreak(userId) {
    const userData = await this.getUserData(userId);
    const today = new Date().toDateString();
    const lastActivity = userData.lastActivity ? new Date(userData.lastActivity).toDateString() : null;
    
    let newStreak = userData.streak || 0;
    
    if (lastActivity !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (lastActivity === yesterday.toDateString()) {
        newStreak += 1;
      } else if (lastActivity !== today) {
        newStreak = 1; // Start new streak
      }
    }

    const updates = {
      streak: newStreak,
      lastActivity: new Date().toISOString()
    };

    // Streak achievements
    if (newStreak > 0 && newStreak % 7 === 0) {
      const streakAchievement = {
        id: `streak_${newStreak}`,
        title: `${newStreak} Day Streak!`,
        description: `Studied for ${newStreak} consecutive days`,
        earnedAt: new Date().toISOString(),
        points: newStreak * 10
      };
      
      updates.achievements = [...(userData.achievements || []), streakAchievement];
      await this.awardPoints(userId, newStreak * 10, `${newStreak} day streak`);
    }

    return await this.updateUserData(userId, updates);
  }
}

module.exports = new GamificationManager();