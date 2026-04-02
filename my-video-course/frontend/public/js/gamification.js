// Gamification system for video learning platform
class GamificationSystem {
  constructor() {
    this.userId = 'guest'; // Default until initialized
    this.achievements = [];
    this.userStats = this.getDefaultStats();
    this.streakData = this.getDefaultStreak();
    this.initializeSystem();
  }

  getDefaultStats() {
    return {
      totalPoints: 0,
      videosWatched: 0,
      coursesCompleted: 0,
      keyboardShortcutsUsed: 0,
      currentLevel: 1,
      experiencePoints: 0
    };
  }

  getDefaultStreak() {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      streakDates: []
    };
  }
  static calculateLevel(xp) {
    return Math.floor((xp || 0) / 1000) + 1;
  }

  static calculateProgress(xp, level) {
    const prevLevelXP = (level - 1) * 1000;
    return Math.min(100, Math.max(0, (((xp || 0) - prevLevelXP) / 1000) * 100));
  }

  // 🎊 Celebration Engine (Neural Core Tier)
  triggerConfetti(intensity = 'medium') {
    if (typeof window.confetti !== 'function') return;

    const MDB_GREEN = '#00ED64';
    const GOLD = '#FFD700';
    const WHITE = '#FFFFFF';

    if (intensity === 'low') {
        confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 }, colors: [MDB_GREEN, WHITE] });
    } else if (intensity === 'medium') {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: [MDB_GREEN, GOLD, WHITE] });
    } else {
        // High Intensity (Classic Grand Finale)
        const duration = 3 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        const interval = setInterval(function() {
            const timeLeft = animationEnd - Date.now();
            if (timeLeft <= 0) return clearInterval(interval);
            const particleCount = 50 * (timeLeft / duration);
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: Math.random(), y: Math.random() - 0.2 } }));
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: Math.random(), y: Math.random() - 0.2 } }));
        }, 250);
    }
  }

  getNSKey(key) {
    return `${key}_${this.userId}`;
  }

  // Achievement definitions
  getAchievementDefinitions() {
    return {
      'first_video': {
        id: 'first_video',
        name: 'Getting Started',
        description: 'Watch your first video',
        icon: '🎬',
        points: 10,
        type: 'milestone'
      },
      'speed_demon': {
        id: 'speed_demon',
        name: 'Speed Demon',
        description: 'Watch 5 videos in one day',
        icon: '⚡',
        points: 50,
        type: 'daily'
      },
      'chapter_master': {
        id: 'chapter_master',
        name: 'Chapter Master',
        description: 'Complete an entire chapter',
        icon: '📚',
        points: 100,
        type: 'progress'
      },
      'streak_warrior': {
        id: 'streak_warrior',
        name: 'Streak Warrior',
        description: 'Maintain a 7-day learning streak',
        icon: '🔥',
        points: 200,
        type: 'streak'
      },
      'course_conqueror': {
        id: 'course_conqueror',
        name: 'Course Conqueror',
        description: 'Complete an entire course',
        icon: '🏆',
        points: 500,
        type: 'completion'
      },
      'keyboard_ninja': {
        id: 'keyboard_ninja',
        name: 'Keyboard Ninja',
        description: 'Use keyboard shortcuts 20 times',
        icon: '⌨️',
        points: 75,
        type: 'interaction'
      },
      'night_owl': {
        id: 'night_owl',
        name: 'Night Owl',
        description: 'Watch videos after 10 PM',
        icon: '🦉',
        points: 25,
        type: 'time'
      },
      'early_bird': {
        id: 'early_bird',
        name: 'Early Bird',
        description: 'Watch videos before 7 AM',
        icon: '🐦',
        points: 25,
        type: 'time'
      },
      'quiz_master': {
        id: 'quiz_master',
        name: 'Quiz Master',
        description: 'Complete 10 quizzes',
        icon: '🧠',
        points: 100,
        type: 'quiz'
      },
      'perfect_score': {
        id: 'perfect_score',
        name: 'Perfect Score',
        description: 'Get 100% on a quiz',
        icon: '💯',
        points: 75,
        type: 'quiz'
      },
      'speed_learner': {
        id: 'speed_learner',
        name: 'Speed Learner',
        description: 'Complete quiz in under 2 minutes',
        icon: '⚡',
        points: 50,
        type: 'quiz'
      }
    };
  }

  // Initialize the gamification system
  async initializeSystem() {
    try {
      const resp = await fetch('/api/auth/me');
      const authData = await resp.json();
      if (authData.success) {
        this.userId = authData.user.email;
      }
    } catch (e) {
      console.warn('Could not fetch user identity, using guest namespace');
    }

    this.achievements = this.loadAchievements();
    // userStats and streakData will be loaded from server but we load from LS for immediate UI
    this.streakData = this.loadStreakDataFromLS();

    this.createFloatingPointsContainer();
    this.createAchievementNotification();
    
    // Load data from Server (DynamoDB/MongoDB)
    await this.loadFromMongoDB();
    
    this.updateProgressDisplay();
    this.checkTimeBasedAchievements();
  }

  // Load user achievements from localStorage
  loadAchievements() {
    const saved = localStorage.getItem(this.getNSKey('user_achievements'));
    return saved ? JSON.parse(saved) : [];
  }

  // Load user statistics from DynamoDB
  async loadUserStats() {
    try {
      const response = await fetch('/api/gamification/load');
      if (response.ok) {
        const data = await response.json();
        return data.userStats || {
          totalPoints: 0,
          videosWatched: 0,
          coursesCompleted: 0,
          keyboardShortcutsUsed: 0,
          currentLevel: 1,
          experiencePoints: 0
        };
      }
    } catch (error) {
      console.warn('Failed to load user stats from DynamoDB:', error);
    }
    return {
      totalPoints: 0,
      videosWatched: 0,
      coursesCompleted: 0,
      keyboardShortcutsUsed: 0,
      currentLevel: 1,
      experiencePoints: 0
    };
  }

  // Load streak data from DynamoDB
  async loadStreakData() {
    try {
      const response = await fetch('/api/gamification/load');
      if (response.ok) {
        const data = await response.json();
        return data.streakData || {
          currentStreak: 0,
          longestStreak: 0,
          lastActiveDate: null,
          streakDates: []
        };
      }
    } catch (error) {
      console.warn('Failed to load streak data from DynamoDB:', error);
    }
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      streakDates: []
    };
  }

  // Save achievements
  saveAchievements() {
    localStorage.setItem(this.getNSKey('user_achievements'), JSON.stringify(this.achievements));
  }

  // Save user stats to DynamoDB
  async saveUserStats() {
    try {
      await fetch('/api/gamification/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userStats: this.userStats,
          streakData: this.streakData,
          achievements: this.achievements
        })
      });
    } catch (error) {
      console.warn('Failed to save user stats to DynamoDB:', error);
    }
  }

  // Save streak data
  saveStreakData() {
    localStorage.setItem(this.getNSKey('learning_streak'), JSON.stringify(this.streakData));
  }

  loadStreakDataFromLS() {
    const saved = localStorage.getItem(this.getNSKey('learning_streak'));
    return saved ? JSON.parse(saved) : this.getDefaultStreak();
  }

  // Sync gamification data with MongoDB
  async syncWithMongoDB() {
    try {
      const response = await fetch('/api/gamification/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          achievements: this.achievements,
          userStats: this.userStats,
          streakData: this.streakData
        })
      });
      if (response.ok) {
        console.log('Gamification data synced with MongoDB');
      }
    } catch (error) {
      console.warn('Failed to sync gamification data:', error);
    }
  }

  // Alias for syncWithMongoDB for compatibility
  async syncWithServer() {
    return this.syncWithMongoDB();
  }

  // Load gamification data from MongoDB
  async loadFromMongoDB() {
    try {
      const response = await fetch('/api/gamification/load');
      if (response.ok) {
        const data = await response.json();
        
        // --- 🛡️ NEURAL CORE: Database Primary ---
        // We prioritize the Server's aggregate truth (totalPoints, level)
        if (data.userStats) {
            this.userStats = {
                ...this.getDefaultStats(),
                ...data.userStats,
                // Ensure Root sync (Standard)
                totalPoints: Number(data.totalPoints || data.userStats.totalPoints || 0),
                currentLevel: Number(data.level || data.userStats.currentLevel || 1)
            };
        }
        
        if (data.achievements) this.achievements = data.achievements;
        if (data.streakData) this.streakData = data.streakData;
        
        console.log(`✅ [NEURAL_INIT] DB Truth Hydrated: LB ${this.userStats.totalPoints} XP / LVL ${this.userStats.currentLevel}`);
        
        // 🧪 Syncing: We only sync local watch status IF the server is missing it.
        // We NEVER let local storage downgrade the server's truth.
        await this.syncWithServerTruth();
        this.updateProgressDisplay();
      }
    } catch (error) {
      console.warn('Failed to load gamification data from MongoDB:', error);
    }
  }

  // 🛡️ Neural Core: Sync local status to Match the Server Truth
  async syncWithServerTruth() {
    try {
      // We prioritize the maps we just loaded from MongoDB/DynamoDB
      const serverMap = this.userStats.videosWatched || {};
      const rootMap = this.videosWatched || {};
      
      // Merge for maximum coverage
      const unifiedMap = { ...rootMap, ...serverMap };
      const watchedCount = Object.keys(unifiedMap).length;
      
      console.log(`📡 [NEURAL_SYNC] Server truth found ${watchedCount} watched lessons. Syncing local counter.`);
      
      this.userStats.videosWatched = watchedCount;
      // Also update the local maps to match the server
      this.videosWatched = unifiedMap;
      
      // Update streak/stats locally for the UI (No Server Push needed as we just loaded)
      this.saveUserStats();
      this.saveAchievements();
    } catch (error) {
      console.warn('Failed to sync with server truth:', error);
    }
  }
  
  // Calculate streak from actual watch dates
  calculateStreakFromDates() {
    if (this.streakData.streakDates.length === 0) {
      this.streakData.currentStreak = 0;
      this.streakData.longestStreak = 0;
      return;
    }
    
    const sortedDates = this.streakData.streakDates.sort();
    const today = new Date(Date.now()).toISOString().split('T')[0];
    
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 1;
    
    // Calculate longest streak
    for (let i = 1; i < sortedDates.length; i++) {
      const prevDate = new Date(sortedDates[i-1]);
      const currDate = new Date(sortedDates[i]);
      const dayDiff = (currDate - prevDate) / (24 * 60 * 60 * 1000);
      
      if (dayDiff === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);
    
    // Calculate current streak (from today backwards)
    const lastWatchDate = sortedDates[sortedDates.length - 1];
    const daysSinceLastWatch = (new Date(today) - new Date(lastWatchDate)) / (24 * 60 * 60 * 1000);
    
    if (daysSinceLastWatch <= 1) {
      currentStreak = 1;
      for (let i = sortedDates.length - 2; i >= 0; i--) {
        const prevDate = new Date(sortedDates[i]);
        const currDate = new Date(sortedDates[i + 1]);
        const dayDiff = (currDate - prevDate) / (24 * 60 * 60 * 1000);
        
        if (dayDiff === 1) {
          currentStreak++;
        } else {
          break;
        }
      }
    }
    
    this.streakData.currentStreak = currentStreak;
    this.streakData.longestStreak = longestStreak;
    this.streakData.lastActiveDate = lastWatchDate;
  }

  // Award points with visual feedback
  awardPoints(points, reason = '') {
    this.userStats.totalPoints += points;
    this.userStats.experiencePoints += points;
    
    // Check for level up
    this.checkLevelUp();
    
    // Show floating points animation
    this.showFloatingPoints(points, reason);
    
    this.saveUserStats();
    this.updateProgressDisplay();
  }

  // Check and handle level up (Unifed with Backend Square Root Intelligence)
  checkLevelUp() {
    const totalXP = (this.userStats.experiencePoints || this.userStats.totalPoints || 0);
    const newLevel = GamificationSystem.calculateLevel(totalXP);
    const oldLevel = this.userStats.currentLevel || 1;
    
    // Always sync currentLevel to the mathematical truth
    if (newLevel !== oldLevel) {
      console.log(`📡 Gamification: Synchronizing Rank Logic (${oldLevel} -> ${newLevel})`);
      this.userStats.currentLevel = newLevel;
      this.saveToStorage();

      if (newLevel > oldLevel) {
        this.showLevelUpNotification(newLevel);
        this.triggerConfetti();
        this.triggerLevelUpEffect(newLevel);
      }
      
      // Sync Sidebar if present
      const sidebarLevel = document.getElementById('sidebar-level');
      if (sidebarLevel) sidebarLevel.innerText = newLevel;
    }
  }

  // Show floating points animation
  showFloatingPoints(points, reason) {
    const container = document.getElementById('floating-points-container');
    const pointsElement = document.createElement('div');
    pointsElement.className = 'floating-points';
    pointsElement.innerHTML = `
      <div class="points-value">+${points}</div>
      ${reason ? `<div class="points-reason">${reason}</div>` : ''}
    `;
    
    // Random horizontal position
    const randomX = Math.random() * 200 - 100;
    pointsElement.style.left = `calc(50% + ${randomX}px)`;
    
    container.appendChild(pointsElement);
    
    // Remove after animation
    setTimeout(() => {
      if (container.contains(pointsElement)) {
        container.removeChild(pointsElement);
      }
    }, 2000);
  }

  // Check if a specific achievement should be awarded
  checkAchievement(achievementId, customData = {}) {
    const definitions = this.getAchievementDefinitions();
    const achievement = definitions[achievementId];
    
    // Check if already earned (Defensive check for both string and object schemas)
    const isEarned = this.achievements.some(a => {
        if (typeof a === 'string') return a === achievementId;
        return a && a.id === achievementId;
    });

    if (!achievement || isEarned) {
      return false;
    }

    let shouldAward = false;

    switch (achievementId) {
      case 'first_video':
        shouldAward = this.userStats.videosWatched >= 1;
        break;
      case 'speed_demon':
        shouldAward = this.checkDailyVideoCount() >= 5;
        break;
      case 'chapter_master':
        shouldAward = customData.chapterCompleted === true;
        break;
      case 'streak_warrior':
        shouldAward = this.streakData.currentStreak >= 7;
        break;
      case 'course_conqueror':
        shouldAward = customData.courseCompleted === true;
        break;
      case 'keyboard_ninja':
        shouldAward = this.userStats.keyboardShortcutsUsed >= 20;
        break;
      case 'night_owl':
        shouldAward = new Date().getHours() >= 22;
        break;
      case 'early_bird':
        shouldAward = new Date().getHours() <= 7;
        break;
      case 'quiz_master':
        const quizCompletions = JSON.parse(localStorage.getItem(this.getNSKey('quiz_completions')) || '[]');
        shouldAward = quizCompletions.length >= 10;
        break;
      case 'perfect_score':
        shouldAward = customData.perfectScore === true;
        break;
      case 'speed_learner':
        shouldAward = customData.timeTaken && customData.timeTaken < 120;
        break;
    }

    if (shouldAward) {
      this.awardAchievement(achievementId);
      return true;
    }
    return false;
  }

  // Award achievement
  awardAchievement(achievementId) {
    const definitions = this.getAchievementDefinitions();
    const achievement = definitions[achievementId];
    
    // Check if already earned (Defensive check for both string and object schemas)
    const isEarned = this.achievements.some(a => {
        if (typeof a === 'string') return a === achievementId;
        return a && a.id === achievementId;
    });
    
    if (isEarned) return;

    this.achievements.push({
        id: achievementId,
        earnedAt: new Date().toISOString()
    });

    this.awardPoints(achievement.points, achievement.name);
    this.showAchievementNotification(achievement);
    this.saveAchievements();
    
    // Special effects for major achievements
    if (achievement.points >= 100) {
      this.triggerConfetti();
    }
  }

  // Show achievement notification
  showAchievementNotification(achievement) {
    // Use existing achievement popup
    const popup = document.getElementById('achievement-popup');
    const icon = document.getElementById('achievement-icon');
    const title = document.getElementById('achievement-title');
    const name = document.getElementById('achievement-name');
    const points = document.getElementById('achievement-points');
    
    if (popup && icon && title && name && points) {
      icon.textContent = achievement.icon;
      title.textContent = 'Achievement Unlocked!';
      name.textContent = achievement.name;
      points.textContent = `+${achievement.points} points`;
      
      popup.classList.add('show');
      
      // Play achievement sound
      this.playAchievementSound();
      
      // Trigger confetti for major achievements
      if (achievement.points >= 100) {
        this.triggerConfetti();
      }
      
      setTimeout(() => {
        popup.classList.remove('show');
      }, 4000);
    }
  }

  // Update learning streak
  updateStreak() {
    const today = new Date(Date.now()).toISOString().split('T')[0];
    const lastActive = this.streakData.lastActiveDate;
    
    if (lastActive !== today) {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      if (lastActive === yesterdayStr) {
        this.streakData.currentStreak++;
      } else if (lastActive !== today) {
        this.streakData.currentStreak = 1;
      }
      
      this.streakData.lastActiveDate = today;
      if (!this.streakData.streakDates.includes(today)) {
        this.streakData.streakDates.push(today);
      }
      
      if (this.streakData.currentStreak > this.streakData.longestStreak) {
        this.streakData.longestStreak = this.streakData.currentStreak;
      }
      
      this.saveStreakData();
      this.syncWithMongoDB();
      this.checkAchievement('streak_warrior');
    }
  }

  // Track video completion
  onVideoCompleted(videoData) {
    this.userStats.videosWatched++;
    this.updateStreak();
    
    // Award base points for video completion
    this.awardPoints(10, 'Video Completed');
    
    // Check various achievements
    this.checkAchievement('first_video');
    this.checkAchievement('speed_demon');
    this.checkTimeBasedAchievements();
    
    // Always check for chapter master achievement when video is completed
    this.checkAchievement('chapter_master', { chapterCompleted: true });
    
    // Check if course is completed
    if (videoData.isLastVideo || videoData.courseCompleted) {
      this.userStats.coursesCompleted++;
      this.checkAchievement('course_conqueror', { courseCompleted: true });
    }
    
    this.saveUserStats();
  }

  // Track keyboard shortcut usage
  onKeyboardShortcut(shortcut) {
    this.userStats.keyboardShortcutsUsed++;
    this.awardPoints(1, `Shortcut: ${shortcut}`);
    this.checkAchievement('keyboard_ninja');
    this.saveUserStats();
  }

  // Check time-based achievements
  checkTimeBasedAchievements() {
    this.checkAchievement('night_owl');
    this.checkAchievement('early_bird');
  }

  // Check daily video count
  checkDailyVideoCount() {
    const today = new Date().toDateString();
    const dailyCount = localStorage.getItem(this.getNSKey(`daily_videos_${today}`));
    return dailyCount ? parseInt(dailyCount) : 0;
  }

  // Increment daily video count
  incrementDailyVideoCount() {
    const today = new Date().toDateString();
    const currentCount = this.checkDailyVideoCount();
    localStorage.setItem(this.getNSKey(`daily_videos_${today}`), (currentCount + 1).toString());
  }

  // Create floating points container
  createFloatingPointsContainer() {
    if (document.getElementById('floating-points-container')) return;
    
    const container = document.createElement('div');
    container.id = 'floating-points-container';
    container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 9999;
    `;
    document.body.appendChild(container);
  }

  // Create achievement notification element
  createAchievementNotification() {
    if (document.getElementById('achievement-notification')) return;
    
    const notification = document.createElement('div');
    notification.id = 'achievement-notification';
    notification.className = 'achievement-notification';
    document.body.appendChild(notification);
  }

  // Update progress display in UI
  updateProgressDisplay() {
    const totalXP = (this.userStats.experiencePoints || this.userStats.totalPoints || 0);
    const level = this.userStats.currentLevel || 1;
    const progress = GamificationSystem.calculateProgress(totalXP, level);
    
    // 1. Sidebar Synchronization
    const sidebarPoints = document.getElementById('sidebar-points');
    const sidebarLevel = document.getElementById('sidebar-level');
    const sidebarProgress = document.getElementById('sidebar-progress-bar');
    // Level logic (Unified Neural Core)
    const levelBefore = parseInt(sidebarLevel?.innerText) || 1;
    const newLevel = Math.floor(totalXP / 1000) + 1;
    const progressVal = Math.min(100, Math.max(0, ((totalXP % 1000) / 10) ));

    if (sidebarLevel) sidebarLevel.innerText = newLevel;
    if (sidebarProgress) sidebarProgress.style.width = `${progressVal}%`;

    // 🚀 Celebration Trigger: Level Up!
    if (newLevel > levelBefore && levelBefore > 0) {
        this.triggerConfetti();
        console.log(`🎊 [NEURAL_CELEBRATION] Level Up detected: ${levelBefore} -> ${newLevel}`);
    }
    
    if (sidebarPoints) sidebarPoints.innerText = totalXP.toLocaleString();

    // 2. Profile Synchronization (if present)
    const profileXP = document.getElementById('current-xp');
    const profileLevel = document.getElementById('user-level');
    const profileProgress = document.getElementById('level-progress');
    const nextLevelXPText = document.getElementById('next-level-xp');

    if (profileLevel) profileLevel.innerText = level;
    if (profileXP) profileXP.innerText = `${totalXP.toLocaleString()} XP ARCHIVED`;
    if (profileProgress) profileProgress.style.width = `${progress}%`;
    if (nextLevelXPText) {
      const nextLVL = level * 1000;
      nextLevelXPText.innerText = `${Math.max(0, nextLVL - totalXP).toLocaleString()} XP TO ASCENSION`;
    }

    // 3. Global Broadcast for Reactive UI Nodes
    window.dispatchEvent(new CustomEvent('pointsUpdated', { 
      detail: { points: totalXP, level: level, progress: progress } 
    }));

    // Standard UI counters (Classes)
    document.querySelectorAll('.user-points').forEach(el => el.textContent = totalXP.toLocaleString());
    document.querySelectorAll('.user-level').forEach(el => el.textContent = level);
    document.querySelectorAll('.user-streak').forEach(el => el.textContent = this.streakData.currentStreak || 0);
  }

  // Show level up notification
  showLevelUpNotification(newLevel) {
    const notification = document.getElementById('achievement-notification');
    if (!notification) return;

    notification.innerHTML = `
      <div class="achievement-content level-up">
        <div class="achievement-icon">🎉</div>
        <div class="achievement-text">
          <div class="achievement-title">Level Up!</div>
          <div class="achievement-name">Level ${newLevel || this.userStats.currentLevel}</div>
          <div class="achievement-points">Infrastructure Architect Mastery +1</div>
        </div>
      </div>
    `;
    
    notification.classList.add('show');
    setTimeout(() => notification.classList.remove('show'), 4000);
  }

  // Trigger confetti effect
  triggerConfetti() {
    if (typeof confetti !== 'undefined') {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }

  // Play achievement sound
  playAchievementSound() {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT');
      audio.volume = 0.3;
      audio.play().catch(() => {}); // Ignore errors if audio can't play
    } catch (e) {
      // Ignore audio errors
    }
  }

  // Count watched videos directly from localStorage API
  async countWatchedVideosFromLocalStorage() {
    try {
      const response = await fetch('/api/videos/localStorage');
      if (response.ok) {
        const localStorageData = await response.json();
        let totalWatched = 0;
        
        Object.keys(localStorageData).forEach(courseName => {
          const courseData = localStorageData[courseName];
          const videos = courseData?.videos || [];
          if (!Array.isArray(videos)) {
            console.warn(`Course ${courseName}: videos is not an array:`, videos);
            return;
          }
          const watchedCount = videos.filter(v => v && v.watched === true).length;
          console.log(`${courseName}: ${watchedCount} watched videos`);
          totalWatched += watchedCount;
        });
        
        console.log(`Total watched videos from localStorage: ${totalWatched}`);
        return totalWatched;
      }
      return this.userStats.videosWatched || 0;
    } catch (error) {
      console.error('Error counting watched videos:', error);
      return this.userStats.videosWatched || 0;
    }
  }
  
  // Get user progress summary
  async getProgressSummary() {
    // Always get fresh count from localStorage
    const actualWatchedCount = await this.countWatchedVideosFromLocalStorage();
    
    return {
      level: this.userStats.currentLevel,
      points: this.userStats.totalPoints,
      videosWatched: actualWatchedCount,
      coursesCompleted: this.userStats.coursesCompleted,
      currentStreak: this.streakData.currentStreak,
      longestStreak: this.streakData.longestStreak,
      achievements: this.achievements.length,
      totalAchievements: Object.keys(this.getAchievementDefinitions()).length
    };
  }
}

// Initialize gamification system when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
  window.gamificationSystem = new GamificationSystem();
  await window.gamificationSystem.initializeSystem();
});