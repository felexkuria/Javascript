// Gamification system for video learning platform
class GamificationSystem {
  constructor() {
    this.achievements = this.loadAchievements();
    this.userStats = this.loadUserStats();
    this.streakData = this.loadStreakData();
    this.initializeSystem();
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
  initializeSystem() {
    this.createFloatingPointsContainer();
    this.createAchievementNotification();
    this.loadFromMongoDB().then(() => {
      this.updateProgressDisplay();
      this.checkTimeBasedAchievements();
    });
    
    // Also sync immediately with localStorage
    setTimeout(() => this.syncWithLocalStorageVideos(), 1000);
  }

  // Load user achievements from localStorage
  loadAchievements() {
    const saved = localStorage.getItem('user_achievements');
    return saved ? JSON.parse(saved) : [];
  }

  // Load user statistics
  loadUserStats() {
    const saved = localStorage.getItem('user_stats');
    return saved ? JSON.parse(saved) : {
      totalPoints: 0,
      videosWatched: 0,
      coursesCompleted: 0,
      keyboardShortcutsUsed: 0,
      currentLevel: 1,
      experiencePoints: 0
    };
  }

  // Load streak data
  loadStreakData() {
    const saved = localStorage.getItem('learning_streak');
    return saved ? JSON.parse(saved) : {
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      streakDates: []
    };
  }

  // Save achievements
  saveAchievements() {
    localStorage.setItem('user_achievements', JSON.stringify(this.achievements));
  }

  // Save user stats
  saveUserStats() {
    localStorage.setItem('user_stats', JSON.stringify(this.userStats));
  }

  // Save streak data
  saveStreakData() {
    localStorage.setItem('learning_streak', JSON.stringify(this.streakData));
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
        if (data.achievements) this.achievements = data.achievements;
        if (data.userStats) this.userStats = data.userStats;
        if (data.streakData) this.streakData = data.streakData;
        
        // Sync with localStorage video data
        await this.syncWithLocalStorageVideos();
        this.updateProgressDisplay();
      }
    } catch (error) {
      console.warn('Failed to load gamification data from MongoDB:', error);
    }
  }

  // Sync gamification stats with localStorage video data
  async syncWithLocalStorageVideos() {
    try {
      const response = await fetch('/api/videos/localStorage');
      if (response.ok) {
        const localStorageData = await response.json();
        let totalWatchedVideos = 0;
        let coursesCompleted = 0;
        const watchDates = new Set();
        
        // Count watched videos and collect watch dates
        Object.keys(localStorageData).forEach(courseName => {
          const courseData = localStorageData[courseName];
          const videos = courseData?.videos || [];
          if (!Array.isArray(videos)) {
            console.warn(`Course ${courseName}: videos is not an array:`, videos);
            return;
          }
          console.log(`Course ${courseName}: ${videos.length} total videos`);
          
          const watchedInCourse = videos.filter(v => {
            if (v && v.watched === true) {
              // Add watch date to streak data
              if (v.watchedAt) {
                const watchDate = new Date(v.watchedAt).toISOString().split('T')[0];
                watchDates.add(watchDate);
              }
              return true;
            }
            return false;
          }).length;
          
          console.log(`Course ${courseName}: ${watchedInCourse} watched videos`);
          totalWatchedVideos += watchedInCourse;
          
          if (videos.length > 0 && watchedInCourse === videos.length) {
            coursesCompleted++;
          }
        });
        
        console.log(`Total watched videos across all courses: ${totalWatchedVideos}`);
        
        // Update streak data with actual watch dates
        this.streakData.streakDates = Array.from(watchDates).sort();
        this.calculateStreakFromDates();
        
        // Force recount from localStorage to ensure accuracy
        const actualWatchedCount = await this.countWatchedVideosFromLocalStorage();
        
        // Update user stats with accurate count
        this.userStats.videosWatched = actualWatchedCount;
        this.userStats.coursesCompleted = coursesCompleted;
        
        console.log(`Updated video count: ${actualWatchedCount} watched videos`);
        
        this.saveUserStats();
        this.saveStreakData();
        this.syncWithMongoDB();
      }
    } catch (error) {
      console.warn('Failed to sync with localStorage videos:', error);
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

  // Check and handle level up
  checkLevelUp() {
    const pointsForNextLevel = this.userStats.currentLevel * 100;
    if (this.userStats.experiencePoints >= pointsForNextLevel) {
      this.userStats.currentLevel++;
      this.userStats.experiencePoints -= pointsForNextLevel;
      this.showLevelUpNotification();
      this.triggerConfetti();
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

  // Check and award achievements
  checkAchievement(achievementId, customData = {}) {
    const definitions = this.getAchievementDefinitions();
    const achievement = definitions[achievementId];
    
    if (!achievement || this.achievements.includes(achievementId)) {
      return false; // Already earned
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
        const quizCompletions = JSON.parse(localStorage.getItem('quiz_completions') || '[]');
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
    
    this.achievements.push(achievementId);
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
    const notification = document.getElementById('achievement-notification');
    notification.innerHTML = `
      <div class="achievement-content">
        <div class="achievement-icon">${achievement.icon}</div>
        <div class="achievement-text">
          <div class="achievement-title">Achievement Unlocked!</div>
          <div class="achievement-name">${achievement.name}</div>
          <div class="achievement-points">+${achievement.points} points</div>
        </div>
      </div>
    `;
    
    notification.classList.add('show');
    
    // Play achievement sound (if available)
    this.playAchievementSound();
    
    setTimeout(() => {
      notification.classList.remove('show');
    }, 4000);
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
    
    // Check if chapter is completed
    if (videoData.isLastInChapter) {
      this.checkAchievement('chapter_master', { chapterCompleted: true });
    }
    
    // Check if course is completed
    if (videoData.isLastVideo) {
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
    const dailyCount = localStorage.getItem(`daily_videos_${today}`);
    return dailyCount ? parseInt(dailyCount) : 0;
  }

  // Increment daily video count
  incrementDailyVideoCount() {
    const today = new Date().toDateString();
    const currentCount = this.checkDailyVideoCount();
    localStorage.setItem(`daily_videos_${today}`, (currentCount + 1).toString());
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
    // Update points display
    const pointsElements = document.querySelectorAll('.user-points');
    pointsElements.forEach(el => {
      const points = this.userStats.totalPoints || 0;
      el.textContent = points.toLocaleString();
    });
    
    // Update level display
    const levelElements = document.querySelectorAll('.user-level');
    levelElements.forEach(el => {
      el.textContent = this.userStats.currentLevel || 1;
    });
    
    // Update streak display
    const streakElements = document.querySelectorAll('.user-streak');
    streakElements.forEach(el => {
      el.textContent = this.streakData.currentStreak || 0;
    });
  }

  // Show level up notification
  showLevelUpNotification() {
    const notification = document.getElementById('achievement-notification');
    notification.innerHTML = `
      <div class="achievement-content level-up">
        <div class="achievement-icon">🎉</div>
        <div class="achievement-text">
          <div class="achievement-title">Level Up!</div>
          <div class="achievement-name">Level ${this.userStats.currentLevel}</div>
          <div class="achievement-points">Keep learning!</div>
        </div>
      </div>
    `;
    
    notification.classList.add('show');
    
    setTimeout(() => {
      notification.classList.remove('show');
    }, 4000);
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
document.addEventListener('DOMContentLoaded', function() {
  window.gamificationSystem = new GamificationSystem();
});