const dynamodb = require('../utils/dynamodb');
const fs = require('fs');
const path = require('path');

// Use environment-specific table names
const TABLE_PREFIX = process.env.NODE_ENV === 'production' ? 'video-course' : 'video-course-dev';

class DynamoVideoService {
  constructor() {
    this.localStoragePath = path.join(__dirname, '../../../data/localStorage.json');
    this.gamificationPath = path.join(__dirname, '../../../data/gamification.json');
  }

  // Get localStorage data as fallback
  getLocalStorage() {
    try {
      if (fs.existsSync(this.localStoragePath)) {
        const data = fs.readFileSync(this.localStoragePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error reading localStorage:', error);
    }
    return {};
  }

  // Get gamification data as fallback
  getGamificationData() {
    try {
      if (fs.existsSync(this.gamificationPath)) {
        const data = fs.readFileSync(this.gamificationPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error reading gamification data:', error);
    }
    return {};
  }

  // Check if DynamoDB is available
  isDynamoAvailable() {
    return dynamodb.isAvailable();
  }

  // Get all courses for a specific user
  async getAllCourses(userId, isTeacher = false) {
    // Always try DynamoDB first
    if (this.isDynamoAvailable()) {
      try {
        const courses = await dynamodb.getAllCourses(userId, isTeacher);
        if (courses && courses.length > 0) {
          // Filter and personalize courses for the user
          return await this.personalizeCoursesForUser(courses, userId);
        }
      } catch (error) {
        console.error('DynamoDB error, falling back to localStorage:', error);
      }
    }

    // Fallback to localStorage for engineerfelex@gmail.com
    if (userId === 'engineerfelex@gmail.com') {
      const localStorage = this.getLocalStorage();
      const courses = [];
      
      for (const courseName of Object.keys(localStorage)) {
        const videos = localStorage[courseName] || [];
        courses.push({
          name: courseName,
          videos,
          offlineMode: true
        });
      }
      return courses;
    }

    // For other users, return empty courses (they'll see DynamoDB courses above)
    return [];
  }

  // Personalize courses with user-specific data
  async personalizeCoursesForUser(courses, userId) {
    const userGamification = await this.getUserGamificationData(userId);
    const watchedVideos = userGamification?.userStats?.videosWatched || {};
    
    return courses.map(course => ({
      ...course,
      videos: course.videos.map(video => ({
        ...video,
        watched: watchedVideos[video._id] || video.watched || false
      }))
    }));
  }

  // Get videos for a specific course with user personalization
  async getVideosForCourse(courseName, userId) {
    // Always try DynamoDB first
    if (this.isDynamoAvailable()) {
      try {
        const videos = await dynamodb.getVideosForCourse(courseName, userId);
        if (videos && videos.length > 0) {
          return await this.personalizeVideosForUser(videos, userId);
        }
      } catch (error) {
        console.error('DynamoDB error, falling back to localStorage:', error);
      }
    }

    // Fallback to localStorage only for engineerfelex@gmail.com
    if (userId === 'engineerfelex@gmail.com') {
      const localStorage = this.getLocalStorage();
      return localStorage[courseName] || [];
    }

    // New users get empty videos
    return [];
  }

  // Personalize videos with user-specific watch status
  async personalizeVideosForUser(videos, userId) {
    const userGamification = await this.getUserGamificationData(userId);
    const watchedVideos = userGamification?.userStats?.videosWatched || {};
    
    return videos.map(video => ({
      ...video,
      watched: watchedVideos[video._id] || video.watched || false
    }));
  }

  // Get a specific video by ID
  async getVideoById(courseName, videoId, userId = 'guest') {
    const videos = await this.getVideosForCourse(courseName, userId);
    return videos.find(v => v._id && v._id.toString() === videoId);
  }

  // Update video watch status for specific user
  async updateVideoWatchStatus(courseName, videoId, watched, userId) {
    // Always use DynamoDB for user-specific data
    if (this.isDynamoAvailable()) {
      try {
        // Update the actual video watch status in DynamoDB
        const success = await dynamodb.updateVideoWatchStatus(courseName, videoId, watched, userId);
        
        // Also update user's gamification data with watch status
        const userGamification = await this.getUserGamificationData(userId) || {
          userStats: { videosWatched: {}, totalPoints: 0, currentLevel: 1 }
        };
        
        if (!userGamification.userStats) {
          userGamification.userStats = { videosWatched: {}, totalPoints: 0, currentLevel: 1 };
        }
        if (!userGamification.userStats.videosWatched) {
          userGamification.userStats.videosWatched = {};
        }
        
        userGamification.userStats.videosWatched[videoId] = watched;
        await this.updateUserGamificationData(userId, userGamification);
        
        return success;
      } catch (error) {
        console.error('DynamoDB error, falling back to localStorage:', error);
      }
    }

    // Fallback to localStorage only if DynamoDB fails
    try {
      const localStorage = this.getLocalStorage();
      const videos = localStorage[courseName] || [];
      const videoIndex = videos.findIndex(v => v._id && v._id.toString() === videoId);
      
      if (videoIndex !== -1) {
        videos[videoIndex].watched = watched;
        videos[videoIndex].watchedAt = watched ? new Date().toISOString() : null;
        
        localStorage[courseName] = videos;
        fs.writeFileSync(this.localStoragePath, JSON.stringify(localStorage, null, 2));
        return true;
      }
    } catch (error) {
      console.error('Error updating localStorage:', error);
    }

    return false;
  }

  // Get user gamification data
  async getUserGamificationData(userId) {
    if (this.isDynamoAvailable()) {
      try {
        const data = await dynamodb.getGamificationData(userId);
        if (data) {
          return data;
        }
      } catch (error) {
        console.error('DynamoDB error, falling back to localStorage:', error);
      }
    }

    // Fallback to localStorage only for engineerfelex@gmail.com
    if (userId === 'engineerfelex@gmail.com') {
      const gamificationData = this.getGamificationData();
      return gamificationData['default_user'] || null;
    }

    // New users get default empty data
    return {
      userStats: {
        totalPoints: 0,
        videosWatched: {},
        coursesCompleted: 0,
        currentLevel: 1,
        experiencePoints: 0
      },
      achievements: [],
      streakData: {
        currentStreak: 0,
        longestStreak: 0,
        lastActiveDate: null,
        streakDates: []
      }
    };
  }

  // Update user gamification data
  async updateUserGamificationData(userId, data) {
    if (this.isDynamoAvailable()) {
      try {
        const success = await dynamodb.saveGamificationData(userId, data);
        if (success) {
          return true;
        }
      } catch (error) {
        console.error('DynamoDB error, falling back to localStorage:', error);
      }
    }

    // Fallback to localStorage
    try {
      const gamificationData = this.getGamificationData();
      gamificationData[userId] = {
        ...data,
        updatedAt: new Date().toISOString()
      };
      
      fs.writeFileSync(this.gamificationPath, JSON.stringify(gamificationData, null, 2));
      return true;
    } catch (error) {
      console.error('Error updating gamification localStorage:', error);
      return false;
    }
  }

  // Migrate data from localStorage to DynamoDB
  async migrateToDatabase() {
    if (!this.isDynamoAvailable()) {
      console.log('❌ DynamoDB not available for migration');
      return false;
    }

    try {
      console.log('🔄 Starting migration to DynamoDB...');
      
      // Create tables if they don't exist
      await dynamodb.createTables();
      
      // Get localStorage data
      const localStorage = this.getLocalStorage();
      const gamificationData = this.getGamificationData();
      
      // Perform migration
      const success = await dynamodb.migrateFromLocalStorage(localStorage, gamificationData);
      
      if (success) {
        console.log('✅ Migration to DynamoDB completed successfully');
        return true;
      } else {
        console.log('❌ Migration to DynamoDB failed');
        return false;
      }
    } catch (error) {
      console.error('❌ Migration error:', error);
      return false;
    }
  }

  // Count videos for a specific course
  async getVideoCount(courseName, userId) {
    try {
      const videos = await this.getVideosForCourse(courseName, userId);
      return {
        total: videos.length,
        watched: videos.filter(v => v.watched).length
      };
    } catch (error) {
      console.error('Error counting videos:', error);
      return { total: 0, watched: 0 };
    }
  }

  // Add video to course
  async addVideoToCourse(courseName, videoData) {
    if (this.isDynamoAvailable()) {
      try {
        return await dynamodb.addVideoToCourse(courseName, videoData);
      } catch (error) {
        console.error('DynamoDB error adding video:', error);
      }
    }
    
    // Fallback to localStorage
    try {
      const localStorage = this.getLocalStorage();
      if (!localStorage[courseName]) {
        localStorage[courseName] = [];
      }
      
      const newVideo = {
        _id: Date.now().toString(),
        ...videoData,
        createdAt: new Date().toISOString()
      };
      
      localStorage[courseName].push(newVideo);
      fs.writeFileSync(this.localStoragePath, JSON.stringify(localStorage, null, 2));
      return true;
    } catch (error) {
      console.error('Error adding video to localStorage:', error);
      return false;
    }
  }

  // Update course properties
  async updateCourse(courseName, courseData) {
    if (this.isDynamoAvailable()) {
      try {
        return await dynamodb.updateCourse(courseName, courseData);
      } catch (error) {
        console.error('DynamoDB error updating course:', error);
      }
    }
    return false;
  }

  // Update video properties
  async updateVideo(courseName, videoId, videoData) {
    if (this.isDynamoAvailable()) {
      try {
        return await dynamodb.updateVideo(courseName, videoId, videoData);
      } catch (error) {
        console.error('DynamoDB error updating video:', error);
      }
    }
    return false;
  }

  // Health check
  async healthCheck() {
    const status = {
      dynamodb: false,
      localStorage: false,
      gamification: false
    };

    // Check DynamoDB
    status.dynamodb = this.isDynamoAvailable();

    // Check localStorage
    try {
      const localStorage = this.getLocalStorage();
      status.localStorage = Object.keys(localStorage).length > 0;
    } catch (error) {
      status.localStorage = false;
    }

    // Check gamification
    try {
      const gamificationData = this.getGamificationData();
      status.gamification = Object.keys(gamificationData).length > 0;
    } catch (error) {
      status.gamification = false;
    }

    return status;
  }
}

module.exports = new DynamoVideoService();