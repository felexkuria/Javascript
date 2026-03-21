/**
 * Frontend Migration Example
 * 
 * This shows how to update frontend code to use MongoDB APIs instead of localStorage
 */

// ========================================
// BEFORE: localStorage-based code
// ========================================

// OLD: Video progress tracking
function markVideoWatchedOLD(videoId, courseName) {
  const watchedVideos = JSON.parse(localStorage.getItem('watchedVideos') || '{}');
  watchedVideos[videoId] = {
    watched: true,
    watchedAt: new Date().toISOString(),
    courseName: courseName
  };
  localStorage.setItem('watchedVideos', JSON.stringify(watchedVideos));
}

// OLD: Get user progress
function getUserProgressOLD() {
  const progress = JSON.parse(localStorage.getItem('userProgress') || '{}');
  return progress;
}

// OLD: Gamification stats
function updateUserStatsOLD(points, level) {
  const stats = JSON.parse(localStorage.getItem('userStats') || '{}');
  stats.totalPoints = (stats.totalPoints || 0) + points;
  stats.currentLevel = level;
  localStorage.setItem('userStats', JSON.stringify(stats));
}

// ========================================
// AFTER: MongoDB API-based code
// ========================================

// NEW: Video progress tracking
async function markVideoWatched(videoId, courseName) {
  try {
    const response = await fetch('/api/videos/watch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        videoId: videoId,
        courseName: courseName,
        watchedAt: new Date().toISOString()
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('✅ Video marked as watched:', result);
    
    // Update UI
    updateVideoUI(videoId, true);
    
    return result;
  } catch (error) {
    console.error('❌ Failed to mark video as watched:', error);
    // Optional: Fallback to localStorage for offline support
    markVideoWatchedOLD(videoId, courseName);
  }
}

// NEW: Get user progress
async function getUserProgress() {
  try {
    const response = await fetch('/api/enrollments/progress', {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.enrollments || [];
  } catch (error) {
    console.error('❌ Failed to get user progress:', error);
    // Fallback to localStorage
    return getUserProgressOLD();
  }
}

// NEW: Gamification stats
async function updateUserStats(points, level) {
  try {
    const response = await fetch('/api/gamification/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        pointsToAdd: points,
        newLevel: level
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('✅ User stats updated:', result);
    
    // Update UI
    updateStatsUI(result.userStats);
    
    return result;
  } catch (error) {
    console.error('❌ Failed to update user stats:', error);
    // Fallback to localStorage
    updateUserStatsOLD(points, level);
  }
}

// ========================================
// Utility Functions
// ========================================

// Get authentication token (implement based on your auth system)
function getAuthToken() {
  // For Cognito JWT tokens
  return localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
}

// Update video UI when marked as watched
function updateVideoUI(videoId, watched) {
  const videoElement = document.querySelector(`[data-video-id="${videoId}"]`);
  if (videoElement) {
    videoElement.classList.toggle('watched', watched);
    const checkmark = videoElement.querySelector('.checkmark');
    if (checkmark) {
      checkmark.style.display = watched ? 'block' : 'none';
    }
  }
}

// Update stats UI
function updateStatsUI(userStats) {
  const pointsElement = document.getElementById('user-points');
  const levelElement = document.getElementById('user-level');
  
  if (pointsElement) pointsElement.textContent = userStats.totalPoints;
  if (levelElement) levelElement.textContent = userStats.currentLevel;
}

// ========================================
// Migration Helper Functions
// ========================================

// Check if user data has been migrated
async function checkMigrationStatus() {
  try {
    const response = await fetch('/api/migrate/status');
    const result = await response.json();
    
    if (result.migrated) {
      console.log('✅ User data migrated to MongoDB');
      // Remove localStorage data after successful migration
      clearLocalStorageData();
    } else {
      console.log('⚠️ User data not yet migrated');
      // Optionally trigger migration
      await triggerMigration();
    }
    
    return result.migrated;
  } catch (error) {
    console.error('❌ Failed to check migration status:', error);
    return false;
  }
}

// Trigger migration from frontend
async function triggerMigration() {
  try {
    console.log('🚀 Starting localStorage migration...');
    
    // Export localStorage data
    const localStorageData = exportLocalStorageData();
    
    // Send to backend for migration
    const response = await fetch('/api/migrate/localStorage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(localStorageData)
    });
    
    if (!response.ok) {
      throw new Error(`Migration failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('✅ Migration completed:', result);
    
    // Clear localStorage after successful migration
    clearLocalStorageData();
    
    return result;
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Clear localStorage data after migration
function clearLocalStorageData() {
  const keysToRemove = [
    'watchedVideos',
    'userProgress', 
    'userStats',
    'courseProgress',
    'gamificationData'
  ];
  
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
  });
  
  console.log('🧹 Cleared localStorage data');
}

// ========================================
// Initialization
// ========================================

// Initialize app with migration check
async function initializeApp() {
  try {
    // Check if user is authenticated
    const authToken = getAuthToken();
    if (!authToken) {
      console.log('User not authenticated, skipping migration check');
      return;
    }
    
    // Check migration status
    const isMigrated = await checkMigrationStatus();
    
    if (isMigrated) {
      console.log('✅ Using MongoDB APIs');
      // Load user data from MongoDB
      await loadUserDataFromMongoDB();
    } else {
      console.log('⚠️ Using localStorage fallback');
      // Continue using localStorage until migration is complete
      loadUserDataFromLocalStorage();
    }
    
  } catch (error) {
    console.error('❌ App initialization failed:', error);
    // Fallback to localStorage
    loadUserDataFromLocalStorage();
  }
}

async function loadUserDataFromMongoDB() {
  try {
    const [progress, stats] = await Promise.all([
      getUserProgress(),
      fetch('/api/gamification/stats').then(r => r.json())
    ]);
    
    // Update UI with MongoDB data
    updateProgressUI(progress);
    updateStatsUI(stats.userStats);
    
  } catch (error) {
    console.error('❌ Failed to load MongoDB data:', error);
    loadUserDataFromLocalStorage();
  }
}

function loadUserDataFromLocalStorage() {
  const progress = getUserProgressOLD();
  const stats = JSON.parse(localStorage.getItem('userStats') || '{}');
  
  updateProgressUI(progress);
  updateStatsUI(stats);
}

function updateProgressUI(progress) {
  // Update course progress in UI
  console.log('Updating progress UI:', progress);
}

// Start the app
document.addEventListener('DOMContentLoaded', initializeApp);

// Export functions for global use
window.markVideoWatched = markVideoWatched;
window.getUserProgress = getUserProgress;
window.updateUserStats = updateUserStats;
window.triggerMigration = triggerMigration;