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
        
        // Count watched videos across all courses
        Object.keys(localStorageData).forEach(courseName => {
          const videos = localStorageData[courseName] || [];
          const watchedInCourse = videos.filter(v => v && v.watched).length;
          totalWatchedVideos += watchedInCourse;
          
          // Check if course is completed (all videos watched)
          if (videos.length > 0 && watchedInCourse === videos.length) {
            coursesCompleted++;
          }
        });
        
        // Update user stats
        this.userStats.videosWatched = totalWatchedVideos;
        this.userStats.coursesCompleted = coursesCompleted;
        
        // Save updated stats
        this.saveUserStats();
        this.syncWithMongoDB();
      }
    } catch (error) {
      console.warn('Failed to sync with localStorage videos:', error);
    }
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
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const lastActive = this.streakData.lastActiveDate;
    
    if (lastActive !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      if (lastActive === yesterdayStr) {
        // Continue streak
        this.streakData.currentStreak++;
      } else if (lastActive !== today) {
        // Reset streak if more than a day gap
        this.streakData.currentStreak = 1;
      }
      
      this.streakData.lastActiveDate = today;
      if (!this.streakData.streakDates.includes(today)) {
        this.streakData.streakDates.push(today);
      }
      
      // Update longest streak
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
      el.textContent = this.userStats.totalPoints.toLocaleString();
    });
    
    // Update level display
    const levelElements = document.querySelectorAll('.user-level');
    levelElements.forEach(el => {
      el.textContent = this.userStats.currentLevel;
    });
    
    // Update streak display
    const streakElements = document.querySelectorAll('.user-streak');
    streakElements.forEach(el => {
      el.textContent = this.streakData.currentStreak;
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

  // Get user progress summary
  getProgressSummary() {
    return {
      level: this.userStats.currentLevel,
      points: this.userStats.totalPoints,
      videosWatched: this.userStats.videosWatched,
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