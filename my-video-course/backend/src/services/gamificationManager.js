const fs = require('fs');
const path = require('path');

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
    let userData = null;

    if (dynamoService.isAvailable()) {
      try {
        userData = await dynamoService.getGamificationData(userId);
      } catch (error) {
        console.error('DynamoDB gamification read error:', error);
      }
    }

    // Fallback to local file if no DynamoDB data
    if (!userData) {
      try {
        const data = JSON.parse(fs.readFileSync(this.gamificationFile, 'utf8'));
        userData = data[userId] || this.getDefaultUserData(userId);
      } catch (error) {
        userData = this.getDefaultUserData(userId);
      }
    }

    // --- HYPER-RESILIENT NORMALIZATION (SOTA Architecture) ---
    // Handle both Flat and Nested (userStats) schemas.
    // 🛡️ TRUTH PRIORITY: Root totalPoints should override nested userStats if available
    const rootPoints = Number(userData.totalPoints || 0);
    const nestedStats = userData.userStats || {};
    const nestedPoints = Number(nestedStats.totalPoints || nestedStats.experiencePoints || 0);
    
    // The "Neural Truth" is the maximum of any available point source (anti-data-loss)
    const effectivePoints = Math.max(rootPoints, nestedPoints);
    
    const normalized = {
      ...this.getDefaultUserData(userId),
      ...userData,
      totalPoints: effectivePoints,
      level: Number(userData.level || nestedStats.level || nestedStats.currentLevel || 1),
      streak: Number(userData.streak || (userData.streakData ? userData.streakData.currentStreak : 0) || 0),
      videosWatched: userData.videosWatched || nestedStats.videosWatched || {}
    };

    // XP RECOVERY ENGINE: If XP is zero but watch history exists, reconstruct.
    if (normalized.totalPoints === 0) {
      const watchedCount = Object.keys(normalized.videosWatched).length;
      if (watchedCount > 0) {
        console.log(`[SYS] Reconstructing missing XP for ${userId} (${watchedCount} lessons found).`);
        normalized.totalPoints = watchedCount * 50;
        normalized.level = Math.floor(normalized.totalPoints / 1000) + 1;
        
        // Auto-Sync the recovered data
        this.updateUserData(userId, normalized).catch(e => console.error('Recovery Sync Failed:', e));
      }
    }

    return normalized;
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
    if (!userId) return false;

    // --- NEURAL CORE: ATOMIC MERGE PROTECTION ---
    // Instead of overwriting, we fetch the current truth and MERGE the updates.
    let currentData;
    try {
        currentData = await this.getUserData(userId);
    } catch (e) {
        currentData = this.getDefaultUserData();
    }

    const currentPoints = Number(currentData.totalPoints || 0);
    const newPoints = Number(updates.totalPoints !== undefined ? updates.totalPoints : currentPoints);

    // --- DATA SHRINKAGE GUARD (Anti-Corruption Engine) ---
    if (currentPoints > 100 && newPoints < (currentPoints * 0.5)) {
        console.error(`[NEURAL_GUARD] BLOCKED DATA SHRINKAGE for ${userId}: ${currentPoints} -> ${newPoints}. This looks like a corruption attempt.`);
        return false; 
    }

    // Perform Deep Merge of complex fields (achievements, stats, videosWatched)
    const finalData = {
        ...currentData,
        ...updates,
        stats: { ...(currentData.stats || {}), ...(updates.stats || {}) },
        videosWatched: { ...(currentData.videosWatched || {}), ...(updates.videosWatched || {}) },
        updatedAt: new Date().toISOString()
    };

    // 🛡️ MERIT UNIFICATION: Convert legacy strings to Objects {id, earnedAt}
    const incomingAchievements = (updates.achievements || []).map(a => 
        typeof a === 'string' ? { id: a, earnedAt: new Date().toISOString() } : a
    );
    const existingAchievements = (currentData.achievements || []).map(a => 
        typeof a === 'string' ? { id: a, earnedAt: currentData.updatedAt || new Date().toISOString() } : a
    );

    // Deduplicate by ID
    const mergedAchievements = [...existingAchievements];
    incomingAchievements.forEach(incoming => {
        if (!mergedAchievements.some(existing => existing.id === incoming.id)) {
            mergedAchievements.push(incoming);
        }
    });
    finalData.achievements = mergedAchievements;

    // 🛡️ SYMMETRY PROTECTION: Force update legacy userStats nested field
    if (finalData.userStats || currentData.userStats) {
        finalData.userStats = {
            ...(currentData.userStats || {}),
            ...(updates.userStats || {}),
            totalPoints: finalData.totalPoints,
            experiencePoints: finalData.totalPoints,
            currentLevel: finalData.level
        };
    }

    // Use DynamoDB service for production
    const dynamoService = require('../utils/dynamodb');
    if (dynamoService.isAvailable()) {
      try {
        return await dynamoService.saveGamificationData(userId, finalData);
      } catch (error) {
        console.error('DynamoDB gamification write error:', error);
      }
    }

    // Fallback to local file
    try {
      const data = fs.existsSync(this.gamificationFile) ? JSON.parse(fs.readFileSync(this.gamificationFile, 'utf8')) : {};
      data[userId] = finalData;
      fs.writeFileSync(this.gamificationFile, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error('Local gamification write error:', error);
      return false;
    }
  }

  async awardPoints(userId, points, reason, options = { save: true }) {
    const userData = await this.getUserData(userId);
    const currentPoints = Number(userData.totalPoints || 0);
    const newTotal = currentPoints + points;
    const newLevel = Math.floor(newTotal / 1000) + 1;

    const updates = {
      totalPoints: newTotal,
      level: newLevel,
      lastActivity: new Date().toISOString()
    };
    
    // Merge stats update if reasonable
    if (userData.stats) {
        updates.stats = { ...userData.stats };
    }

    // --- UI/UX FIX (Designer): Premium Badge Tier ---
    if (newLevel >= 7 && (userData.level < 7 || !userData.premiumStatus)) {
      updates.premiumStatus = 'active';
      updates.premiumUnlocked = true;
      updates.achievements = [...(userData.achievements || []), {
        id: 'premium_legend',
        title: '🌟 Premium Legend Unlocked!',
        description: 'You have reached the elite tier of ProjectLevi learners.',
        earnedAt: new Date().toISOString(),
        points: 1000,
        isPremium: true
      }];
    }

    // Check for level up achievement
    if (newLevel > userData.level) {
      updates.achievements = [...(userData.achievements || (updates.achievements || [])), {
        id: `level_${newLevel}`,
        title: `Level ${newLevel} Reached!`,
        description: `You've reached level ${newLevel}`,
        earnedAt: new Date().toISOString(),
        points: 100
      }];
    }

    console.log(`🎯 [NEURAL_SCORE] Awarding ${points} pts to ${userId} for ${reason}. (Total: ${newTotal})`);
    
    if (options.save) {
        return await this.updateUserData(userId, updates);
    }
    return updates;
  }

  async recordVideoWatch(userId, courseName, videoTitle, videoId) {
    const userData = await this.getUserData(userId);
    const stats = userData.stats || {};
    const videosWatchedMap = userData.videosWatched || userData.userStats?.videosWatched || {};
    
    // 🛡️ Persistence Guard: Ensure the videoId is recorded for curriculum sync
    if (videoId) {
      videosWatchedMap[videoId] = true;
    }

    // 🔥 NEURAL CONVERGENCE: Perform all calculations before saving
    const awardUpdates = await this.awardPoints(userId, 50, `watching ${videoTitle || videoId}`, { save: false });

    const finalUpdates = {
      ...awardUpdates,
      videosWatched: videosWatchedMap,
      stats: {
        ...stats,
        videosWatched: (stats.videosWatched || 0) + 1
      }
    };

    console.log(`🎬 [NEURAL_WATCH] Syncing video watch for ${userId}. (Total Points Target: ${finalUpdates.totalPoints})`);
    return await this.updateUserData(userId, finalUpdates);
  }

  async recordCourseCompletion(userId, courseName) {
    const userData = await this.getUserData(userId);
    const stats = userData.stats || {};
    
    const updates = {
      stats: {
        ...stats,
        coursesCompleted: (stats.coursesCompleted || 0) + 1
      }
    };

    // Award achievement for course completion
    const courseAchievement = {
      id: `course_completed_${courseName}_${Date.now()}`,
      title: 'Course Completed!',
      description: `Completed ${courseName}`,
      earnedAt: new Date().toISOString(),
      points: 500
    };
    
    updates.achievements = [...(userData.achievements || []), courseAchievement];
    
    // Award bonus points for course completion
    await this.awardPoints(userId, 500, `completing course: ${courseName}`);
    
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

  /**
   * Adjusts XP based on conversational evaluation.
   * Atomic operation that supports negative scaling.
   */
  /**
   * Adjusts XP based on conversational evaluation. (Neural Core Integrated)
   */
  async adjustChatExperiencePoints(userId, amount) {
    const userData = await this.getUserData(userId);
    
    // Unify nested schema: Total XP is stored in userData.totalPoints (normalized by getUserData)
    const currentPoints = Number(userData.totalPoints || 0);
    const newTotal = currentPoints + amount;
    const newLevel = Math.floor(newTotal / 1000) + 1;

    // Use set-based updates for atomic-like consistency in our SOTA wrapper
    const updates = {
      ...userData,
      totalPoints: newTotal,
      level: newLevel,
      lastActivity: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    console.log(`🎮 [CHRONOS_SYNC] AI Chat XP adjustment for ${userId}: ${amount > 0 ? '+' : ''}${amount}. (Primary: ${currentPoints} -> ${newTotal})`);
    
    const success = await this.updateUserData(userId, updates);
    return success ? updates : userData;
  }
}

module.exports = new GamificationManager();