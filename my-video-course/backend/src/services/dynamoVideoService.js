const dynamodb = require('../utils/dynamodb');
const { GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');
const path = require('path');

// Use environment-specific table names
const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
const TABLE_PREFIX = `video-course-app-videos-${environment}`;

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

  // Calculate per-section progress percentages
  getSectionProgress(lectures) {
    if (!lectures || lectures.length === 0) return 0;
    const watched = lectures.filter(v => v.watched).length;
    return Math.round((watched / lectures.length) * 100);
  }

  // SOTA Smart Curriculum Engine
  async getStructuredCurriculum(course, userId) {
    if (!course) return [];
    
    // 1. Fetch user-specific progress to ensure watched states are up to date
    const userGamification = await this.getUserGamificationData(userId);
    const watchedVideos = userGamification?.userStats?.videosWatched || {};
    
    // 2. Normalize videos with watched state
    const allVideos = (course.videos || []).map(v => ({
      ...v,
      watched: !!(watchedVideos[v.videoId] || watchedVideos[v._id] || v.watched),
      id: v.videoId || v._id
    }));

    // 3. Use explicit sections if they exist in the model
    if (course.sections && course.sections.length > 0) {
      return course.sections.map(s => {
        // 🛡️ Robust Duplication Filter: Ensure unique lectures per section even if data is redundant
        const uniqueLectures = [];
        const seenIds = new Set();
        
        (s.lectures || []).forEach(l => {
          // 🛡️ Hyper-Resilient ID Matcher: Support every possible field including title fallback
          const lectureId = (l.videoId || l.contentId || l.id || l._id || l.lectureId || l.title || '').toString();
          if (!lectureId || seenIds.has(lectureId)) return;
          seenIds.add(lectureId);
          uniqueLectures.push(l);
        });

        const hydratedLectures = uniqueLectures.map(l => {
          const lectureId = (l.videoId || l._id || l.id || '').toString();
          const matchingVideo = allVideos.find(v => 
            (v.id || '').toString() === lectureId || 
            (v._id || '').toString() === lectureId || 
            (v.contentId || '').toString() === lectureId ||
            (v.videoId || '').toString() === lectureId
          );

          // 🏗️ Smart Hydration: Prefer the real S3 assets from the flat list
          return { 
            ...l, 
            ...(matchingVideo || {}),
            watched: matchingVideo?.watched || l.watched || false,
            // Explicitly ensure critical S3 fields are NOT lost if l has stale placeholders
            videoUrl: matchingVideo?.videoUrl || matchingVideo?.url || l.videoUrl || l.url,
            s3Key: matchingVideo?.s3Key || l.s3Key,
            captionsUrl: matchingVideo?.captionsUrl || l.captionsUrl,
            type: matchingVideo?.type || l.type || 'video'
          };
        }).filter(l => {
          // 🛡️ Phantom Module Defense: A module with no video URL is a broken link and should not be displayed
          return l.videoUrl && l.videoUrl !== 'undefined' && l.videoUrl !== 'null';
        });

        return {
          ...s,
          lectures: hydratedLectures,
          progress: this.getSectionProgress(hydratedLectures)
        };
      }).filter(s => s.lectures.length > 0); // Hide empty sections resulting from phantom pruning
    }

    // 4. Smart Regex Grouping (Fallback)
    const sections = [];
    const sectionMap = {};
    
    allVideos.forEach(v => {
      // Logic: Detect "Module X", "Chapter Y", "1.1", "2.3" patterns
      let sName = v.section || v.sectionTitle;
      
      if (!sName) {
        const moduleMatch = v.title?.match(/(?:module|chapter|unit|section)\s*(\d+)/i);
        const dotMatch = v.title?.match(/^(\d+)\.\d+/);
        
        if (moduleMatch) sName = `Module ${moduleMatch[1]}`;
        else if (dotMatch) sName = `Phase ${dotMatch[1]}`;
        else sName = 'Core Curriculum';
      }

      if (!sectionMap[sName]) {
        sectionMap[sName] = { title: sName, lectures: [] };
        sections.push(sectionMap[sName]);
      }
      sectionMap[sName].lectures.push(v);
    });

    // 5. Enhance sections with progress
    return sections.map(s => ({
      ...s,
      progress: this.getSectionProgress(s.lectures)
    }));
  }

  // Personalize courses with user-specific data and proper sorting
  async personalizeCoursesForUser(courses, userId) {
    const userGamification = await this.getUserGamificationData(userId);
    const watchedVideos = userGamification?.userStats?.videosWatched || {};
    
    return courses.map(course => {
      const personalizedVideos = (course.videos || []).map(video => ({
        ...video,
        watched: !!(watchedVideos[video.videoId] || watchedVideos[video._id] || video.watched)
      }));
      
      // Sort videos numerically by lesson number
      const sortedVideos = personalizedVideos.sort((a, b) => {
        const aMatch = (a.title || '').match(/lesson(\d+)/i) || (a._id || '').match(/lesson(\d+)/i);
        const bMatch = (b.title || '').match(/lesson(\d+)/i) || (b._id || '').match(/lesson(\d+)/i);
        
        if (aMatch && bMatch) {
          return parseInt(aMatch[1], 10) - parseInt(bMatch[1], 10);
        }
        return 0;
      });

      return { ...course, videos: sortedVideos };
    });
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

  // Personalize videos with user-specific watch status and proper sorting
  async personalizeVideosForUser(videos, userId) {
    const userGamification = await this.getUserGamificationData(userId);
    const watchedVideos = userGamification?.userStats?.videosWatched || {};
    
    const personalizedVideos = videos.map(video => ({
      ...video,
      watched: !!(watchedVideos[video.videoId] || watchedVideos[video._id] || video.watched)
    }));
    
    // Sort videos numerically by lesson number
    return personalizedVideos.sort((a, b) => {
      const aMatch = a.title?.match(/lesson(\d+)/i) || a._id?.match(/lesson(\d+)/i);
      const bMatch = b.title?.match(/lesson(\d+)/i) || b._id?.match(/lesson(\d+)/i);
      
      if (aMatch && bMatch) {
        return parseInt(aMatch[1], 10) - parseInt(bMatch[1], 10);
      }
      
      // Fallback to alphabetical sorting
      return (a.title || a._id || '').localeCompare(b.title || b._id || '');
    });
  }

  // Get a specific course by its unique partition key (courseName)
  async getCourseByTitle(courseName, userId = 'guest') {
    // 🏗️ Performance Boost: Direct indexed lookup on the partition key
    const course = await dynamodb.getCourse(courseName);
    if (course) return course;

    // Fallback: If not found by ID, try finding by title in the full course list
    const courses = await this.getAllCourses(userId);
    return courses.find(c => c.title === courseName);
  }


  // Get a specific video by ID or title
  async getVideoById(courseName, videoId, userId = 'guest') {
    const videos = await this.getVideosForCourse(courseName, userId);
    const targetId = (videoId || '').toString();

    // 🛡️ Robust Matcher: Find by any ID variation
    const video = videos.find(v => 
      (v.videoId && v.videoId.toString() === targetId) || 
      (v._id && v._id.toString() === targetId) || 
      (v.id && v.id.toString() === targetId) ||
      (v.title === videoId)
    );

    return video;
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
        
        // --- NEW (Senior Data Engineer): Activity Logging ---
        if (!userGamification.streakData) {
          userGamification.streakData = { currentStreak: 0, longestStreak: 0, lastActivity: null, streakDates: [] };
        }
        if (!userGamification.streakData.streakDates) {
          userGamification.streakData.streakDates = [];
        }
        
        const today = new Date().toISOString().split('T')[0];
        if (watched && !userGamification.streakData.streakDates.includes(today)) {
          userGamification.streakData.streakDates.push(today);
        }
        
        userGamification.userStats.videosWatched[videoId] = watched;
        await this.updateUserGamificationData(userId, userGamification);
        
        // --- NEW: Sync enrollment progress ---
        if (success && watched) {
          try {
            await this.syncEnrollmentProgress(userId, courseName);
          } catch (syncErr) {
            console.warn('Enrollment progress sync failed (non-critical):', syncErr.message);
          }
        }
        
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
    let data = null;
    if (this.isDynamoAvailable()) {
      try {
        data = await dynamodb.getGamificationData(userId);
      } catch (error) {
        console.error('DynamoDB error, falling back to localStorage:', error);
      }
    }

    // Fallback to localStorage only for engineerfelex@gmail.com
    if (!data && userId === 'engineerfelex@gmail.com') {
      const gData = this.getGamificationData();
      data = gData['default_user'] || null;
    }

    // 🏗️ Schema Normalization Layer (Fixes Flat vs Nested logic)
    const normalized = {
      userStats: {
        totalPoints: 0,
        videosWatched: {},
        coursesCompleted: 0,
        currentLevel: 1,
        experiencePoints: 0,
        quizzesTaken: 0,
        perfectQuizzes: 0,
        studyDays: 0
      },
      achievements: [],
      streakData: {
        currentStreak: 0,
        longestStreak: 0,
        lastActivity: new Date().toISOString()
      }
    };

    if (data) {
      const stats = data.userStats || data; // Handle both nested and flat schemas
      normalized.userStats = {
        totalPoints: Number(stats.totalPoints || data.totalPoints || 0),
        videosWatched: stats.videosWatched || data.videosWatched || {},
        coursesCompleted: Number(stats.coursesCompleted || data.coursesCompleted || 0),
        currentLevel: Math.floor(Math.sqrt((Number(stats.experiencePoints || data.experiencePoints || stats.totalPoints || data.totalPoints || 0)) / 100)) + 1,
        experiencePoints: Number(stats.experiencePoints || data.experiencePoints || stats.totalPoints || data.totalPoints || 0),
        quizzesTaken: Number(stats.quizzesTaken || data.quizzesTaken || 0),
        perfectQuizzes: Number(stats.perfectQuizzes || data.perfectQuizzes || 0),
        studyDays: Number(stats.studyDays || data.studyDays || 0)
      };
      normalized.achievements = data.achievements || [];
      normalized.streakData = data.streakData || normalized.streakData;
      
      // --- NEW (Senior Data Engineer): SOTA Activity Backfill ---
      if (normalized.streakData.streakDates.length === 0 && Object.keys(normalized.userStats.videosWatched).length > 0) {
        console.log(`[SYS] Backfilling streak dates for user ${userId}...`);
        const watchDates = new Set();
        // Here we'd ideally fetch all videos to get watchedAt, but for now we'll assume today if none found
        // To be truly accurate, we trust the updateVideoWatchStatus to handle NEW events,
        // but for migration, we'll mark the 'lastActivity' date at minimum.
        if (normalized.streakData.lastActivity) {
          watchDates.add(normalized.streakData.lastActivity.split('T')[0]);
        }
        normalized.streakData.streakDates = Array.from(watchDates);
      }
    }

    return normalized;
  }

  // Update user gamification data with schema enforcement
  async updateUserGamificationData(userId, data) {
    if (!this.isDynamoAvailable()) return false;
    try {
      // 🛡️ Enforce clean nested schema on save
      const cleanData = {
        userStats: data.userStats,
        achievements: data.achievements,
        streakData: data.streakData
      };
      
      // Remove any top-level polluting attributes accidentally passed from legacy calls
      delete cleanData.userStats.userId;
      
      return await dynamodb.saveGamificationData(userId, cleanData);
    } catch (error) {
      console.error('Error updating gamification data:', error);
      return false;
    }
  }

  async updateStreak(userId) {
    const data = await this.getUserGamificationData(userId);
    const today = new Date().toDateString();
    
    // Initialized by getUserGamificationData
    const streak = data.streakData;
    const lastActivity = streak.lastActivity ? new Date(streak.lastActivity).toDateString() : null;
    
    if (lastActivity !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (lastActivity === yesterday.toDateString()) {
        streak.currentStreak += 1;
      } else {
        streak.currentStreak = 1; // Reset or start new
      }
      
      if (streak.currentStreak > (streak.longestStreak || 0)) {
        streak.longestStreak = streak.currentStreak;
      }
      
      streak.lastActivity = new Date().toISOString();
      
      const todayDate = new Date().toISOString().split('T')[0];
      if (!streak.streakDates) streak.streakDates = [];
      if (!streak.streakDates.includes(todayDate)) {
        streak.streakDates.push(todayDate);
      }
      
      // Award points for streak milestones (match legacy logic)
      if (streak.currentStreak > 0 && streak.currentStreak % 7 === 0) {
        const bonus = streak.currentStreak * 10;
        data.userStats.totalPoints += bonus;
        data.achievements.push({
          id: `streak_${streak.currentStreak}`,
          title: `${streak.currentStreak} Day Streak!`,
          description: `Studied for ${streak.currentStreak} consecutive days`,
          earnedAt: new Date().toISOString(),
          points: bonus
        });
      }
      
      await this.updateUserGamificationData(userId, data);
    }
    return data;
  }

  async recordCourseCompletion(userId, courseName) {
    const data = await this.getUserGamificationData(userId);
    data.userStats.coursesCompleted = (data.userStats.coursesCompleted || 0) + 1;
    
    const achievement = {
      id: `course_completed_${courseName.replace(/\s+/g, '_')}_${Date.now()}`,
      title: 'Path Mastery!',
      description: `Successfully completed the educational track: ${courseName}`,
      earnedAt: new Date().toISOString(),
      points: 500
    };
    
    data.achievements.push(achievement);
    data.userStats.totalPoints += 500;
    
    await this.updateUserGamificationData(userId, data);
    return data;
  }

  async recordQuizCompletion(userId, score, totalQuestions) {
    const data = await this.getUserGamificationData(userId);
    const percentage = (score / totalQuestions) * 100;
    let points = Math.round(percentage * 2); // 0-200 points
    
    data.userStats.quizzesTaken += 1;
    if (percentage === 100) {
      data.userStats.perfectQuizzes += 1;
      points += 100; // Bonus
      data.achievements.push({
        id: `perfect_quiz_${Date.now()}`,
        title: 'Architectural Excellence!',
        description: 'Achieved a perfect score in a technical assessment.',
        earnedAt: new Date().toISOString(),
        points: 100
      });
    }
    
    data.userStats.totalPoints += points;
    await this.updateUserGamificationData(userId, data);
    return data;
  }

  async recordLabCompletion(userId, labId, points = 200) {
    const data = await this.getUserGamificationData(userId);
    data.userStats.totalPoints += points;
    data.userStats.experiencePoints += points;
    
    data.achievements.push({
      id: `lab_completed_${labId}_${Date.now()}`,
      title: 'Architectural Deployment!',
      description: 'Successfully executed a high-fidelity technical lab scenario.',
      earnedAt: new Date().toISOString(),
      points: points
    });
    
    await this.updateUserGamificationData(userId, data);
    return data;
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

  // Caption caching methods
  async getCachedCaption(courseName, videoId) {
    if (!this.isConnected) return null;
    
    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
    
    try {
      const params = {
        TableName: `video-course-app-captions-${environment}`,
        Key: { 
          courseName: courseName,
          videoId: videoId 
        }
      };
      
      const result = await this.docClient.send(new GetCommand(params));
      return result.Item?.captionContent || null;
    } catch (error) {
      console.error('Error getting cached caption:', error);
      return null;
    }
  }
  
  async cacheCaption(courseName, videoId, captionContent) {
    if (!this.isConnected) return false;
    
    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
    
    try {
      const params = {
        TableName: `video-course-app-captions-${environment}`,
        Item: {
          courseName: courseName,
          videoId: videoId,
          captionContent: captionContent,
          cachedAt: new Date().toISOString()
        }
      };
      
      await this.docClient.send(new PutCommand(params));
      return true;
    } catch (error) {
      console.error('Error caching caption:', error);
      return false;
    }
  }

  // Learning content caching
  async getCachedLearningContent(courseName, videoId, type) {
    if (!this.isDynamoAvailable()) return null;
    
    try {
      const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
      const { GetCommand } = require('@aws-sdk/lib-dynamodb');
      
      const params = {
        TableName: `video-course-app-captions-${environment}`,
        Key: { 
          courseName: courseName,
          videoId: `${videoId}_${type}` // summary, quiz, or todo
        }
      };
      
      const result = await dynamodb.docClient.send(new GetCommand(params));
      return result.Item?.captionContent || null;
    } catch (error) {
      return null;
    }
  }
  
  async cacheLearningContent(courseName, videoId, type, content) {
    if (!this.isDynamoAvailable()) return false;
    
    try {
      const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');
      
      const params = {
        TableName: `video-course-app-captions-${environment}`,
        Item: {
          courseName: courseName,
          videoId: `${videoId}_${type}`,
          captionContent: JSON.stringify(content),
          cachedAt: new Date().toISOString()
        }
      };
      
      await dynamodb.docClient.send(new PutCommand(params));
      return true;
    } catch (error) {
      return false;
    }
  }

  // AI chat response caching
  async getCachedAIResponse(message, context) {
    if (!this.isDynamoAvailable()) return null;
    
    try {
      const cacheKey = Buffer.from(message + JSON.stringify(context)).toString('base64').slice(0, 50);
      const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
      const { GetCommand } = require('@aws-sdk/lib-dynamodb');
      
      const params = {
        TableName: `video-course-app-captions-${environment}`,
        Key: { 
          courseName: 'ai_chat',
          videoId: cacheKey
        }
      };
      
      const result = await dynamodb.docClient.send(new GetCommand(params));
      return result.Item?.captionContent || null;
    } catch (error) {
      return null;
    }
  }
  
  async cacheAIResponse(message, context, response) {
    if (!this.isDynamoAvailable()) return false;
    
    try {
      const cacheKey = Buffer.from(message + JSON.stringify(context)).toString('base64').slice(0, 50);
      const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');
      
      const params = {
        TableName: `video-course-app-captions-${environment}`,
        Item: {
          courseName: 'ai_chat',
          videoId: cacheKey,
          captionContent: response,
          cachedAt: new Date().toISOString()
        }
      };
      
      await dynamodb.docClient.send(new PutCommand(params));
      return true;
    } catch (error) {
      return false;
    }
  }

  // Get watch dates and activity counts for a specific user
  async getWatchDates(userId) {
    const userGamification = await this.getUserGamificationData(userId);
    const watchDates = userGamification?.streakData?.streakDates || [];
    const achievements = userGamification?.achievements || [];
    
    const activityMap = {};
    
    // Add video watch dates
    watchDates.forEach(date => {
      activityMap[date] = (activityMap[date] || 0) + 1;
    });
    
    // Add achievement dates
    achievements.forEach(ach => {
      if (ach.earnedAt || ach.unlockedAt) {
        const date = (ach.earnedAt || ach.unlockedAt).split('T')[0];
        activityMap[date] = (activityMap[date] || 0) + 1;
      }
    });
    
    // Convert to array format for frontend compat
    return Object.keys(activityMap).map(date => ({
      date,
      count: activityMap[date]
    }));
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

  // Update course videos (Save many) - Stage 4 Optimized
  async updateCourseVideos(courseName, videos, userId) {
    if (!this.isDynamoAvailable()) return false;
    try {
      const logger = require('../utils/logger');
      logger.info(`🚀 Optimized Batch Sync: ${videos.length} videos for course: ${courseName}`);
      return await dynamodb.batchSaveVideos(courseName, videos);
    } catch (error) {
       console.error('❌ Failed to update course videos in Dynamo:', error.message);
       return false;
    }
  }

  // Enrollment operations
  async enrollUser(userId, courseName) {
    if (!this.isDynamoAvailable()) return false;
    try {
      const sanitizedCourseName = courseName.toString().trim();
      return await dynamodb.saveEnrollment(userId, sanitizedCourseName, {
        progress: 0,
        completedLectures: [],
        status: 'active',
        enrolledAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error enrolling user in DynamoDB:', error);
      return false;
    }
  }

  async syncEnrollmentProgress(userId, courseName) {
    if (!this.isDynamoAvailable()) return false;
    try {
      const sanitizedUserId = userId.toString().trim();
      const sanitizedCourseName = courseName.toString().trim();
      
      const videos = await this.getVideosForCourse(sanitizedCourseName, sanitizedUserId);
      if (!videos || videos.length === 0) return false;

      const completedLectures = videos
        .filter(v => v.watched)
        .map(v => ({
          lectureId: v.videoId || v._id,
          completedAt: v.watchedAt || new Date().toISOString()
        }));

      const progress = Math.round((completedLectures.length / videos.length) * 100);
      
      // Get existing enrollment to preserve enrolledAt
      const enrollments = await this.getUserEnrollments(sanitizedUserId);
      const existing = enrollments.find(e => e.courseName === sanitizedCourseName);

      return await dynamodb.saveEnrollment(sanitizedUserId, sanitizedCourseName, {
        progress,
        completedLectures,
        enrolledAt: existing?.enrolledAt || new Date().toISOString(),
        status: existing?.status || 'active'
      });
    } catch (error) {
      console.error('Error syncing enrollment progress:', error);
      return false;
    }
  }


  async getUserEnrollments(userId) {
    if (!this.isDynamoAvailable()) return [];
    try {
      return await dynamodb.getEnrollments(userId);
    } catch (error) {
      console.error('Error getting user enrollments from DynamoDB:', error);
      return [];
    }
  }

  async deleteCourse(courseName) {
    if (this.isDynamoAvailable()) {
      try {
        await dynamodb.deleteVideosForCourse(courseName);
        return await dynamodb.deleteCourse(courseName);
      } catch (error) {
        console.error('DynamoDB error deleting course:', error);
      }
    }
    return false;
  }
}

module.exports = new DynamoVideoService();