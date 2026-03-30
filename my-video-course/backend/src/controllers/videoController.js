const dynamoVideoService = require('../services/dynamoVideoService');
const s3VideoService = require('../services/s3VideoService');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

exports.getVideos = async (req, res) => {
  try {
    const userId = req.user?.email || req.session?.user?.email;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const courses = await dynamoVideoService.getAllCourses(userId);
    const allVideos = courses.flatMap(course => course.videos);
    
    // Universal S3 Signing
    const signedVideos = await s3VideoService.processVideoList(allVideos);
    
    const totalVideos = signedVideos.length;
    const watchedVideos = signedVideos.filter(video => video.watched).length;

    res.render('videos', { videos: signedVideos, totalVideos, watchedVideos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllVideos = async (req, res) => {
  try {
    const userId = req.user?.email || req.session?.user?.email;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const courses = await dynamoVideoService.getAllCourses(userId);
    const videos = courses.flatMap(course => course.videos);
    
    // Universal S3 Signing
    const signedVideos = await s3VideoService.processVideoList(videos);
    
    res.render('dashboard', { videos: signedVideos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getVideoById = async (req, res) => {
  try {
    const userId = req.user?.email || req.session?.user?.email;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const courses = await dynamoVideoService.getAllCourses(userId);
    const videoId = req.params.id;
    
    // Find the course containing this video
    const course = courses.find(c => c.videos.some(v => (v._id || v.id || '').toString() === videoId));
    
    if (!course) {
      return res.status(404).send('Course not found for this node');
    }

    const video = course.videos.find(v => (v._id || v.id || '').toString() === videoId);

    // Universal S3 Signing
    const signedVideo = await s3VideoService.processVideoUrl(video);
    
    // SOTA Smart Curriculum Engine
    const sections = await dynamoVideoService.getStructuredCurriculum(course, userId);

    // Batch Sign S3 Assets for Sidebar
    const signedSections = await Promise.all(sections.map(async (section) => ({
      ...section,
      lectures: await s3VideoService.processVideoList(section.lectures)
    })));

    res.render('video', { 
      video: signedVideo, 
      courseName: course.name,
      sections: signedSections,
      totalVideos: course.videos.length,
      watchedVideos: course.videos.filter(v => v.watched).length
    });
  } catch (err) {
    console.error('Error fetching video curriculum:', err);
    res.status(500).send('Curriculum Load Error');
  }
};

// Mark video as watched and redirect to the next video
exports.markVideoAsWatched = async (req, res) => {
  try {
    const videoId = req.params.id;
    const userId = req.user?.email || req.session?.user?.email;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const courses = await dynamoVideoService.getAllCourses(userId);
    const allVideos = courses.flatMap(course => course.videos);
    const video = allVideos.find(v => (v._id || v.id || '').toString() === videoId);

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Mark video as watched for this user
    await dynamoVideoService.updateVideoWatchStatus(video.courseName, videoId, true, userId);

    const currentIndex = allVideos.findIndex(v => (v._id || v.id || '').toString() === videoId);
    const nextVideo = currentIndex < allVideos.length - 1 ? allVideos[currentIndex + 1] : null;

    if (nextVideo) {
      res.redirect(`/videos/${nextVideo._id}`);
    } else {
      res.redirect(`/videos/${videoId}`);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// API methods for mobile/frontend
exports.getVideosByCourse = async (req, res) => {
  try {
    const { courseName } = req.params;
    const userId = req.user?.email || req.session?.user?.email;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const videos = await dynamoVideoService.getVideosForCourse(courseName, userId);
    
    // Universal S3 Signing
    const signedVideos = await s3VideoService.processVideoList(videos);
    
    res.json({ success: true, data: signedVideos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getVideo = async (req, res) => {
  try {
    const { courseName, videoId } = req.params;
    const userId = req.user?.email || req.session?.user?.email;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const videos = await dynamoVideoService.getVideosForCourse(courseName, userId);
    const video = videos.find(v => v._id.toString() === videoId);
    if (!video) {
      return res.status(404).json({ success: false, error: 'Video not found' });
    }
    
    // Universal S3 Signing
    const signedVideo = await s3VideoService.processVideoUrl(video);
    res.json({ success: true, data: signedVideo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.markWatched = async (req, res) => {
  try {
    const { courseName, videoId } = req.params;
    const userId = req.user?.email || req.session?.user?.email || 'guest';
    
    // Get video details first
    const videos = await dynamoVideoService.getVideosForCourse(courseName, userId);
    const video = videos.find(v => v._id.toString() === videoId);
    
    if (!video) {
      return res.status(404).json({ success: false, error: 'Video not found' });
    }
    
    // Update watch status
    const success = await dynamoVideoService.updateVideoWatchStatus(courseName, videoId, true, userId);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Failed to update watch status' });
    }
    
    // Award gamification points
    await dynamoVideoService.updateStreak(userId);

    
    // Check if course is completed
    const allVideos = await dynamoVideoService.getVideosForCourse(courseName, userId);
    const watchedCount = allVideos.filter(v => v.watched).length + 1; // +1 for current video
    const totalCount = allVideos.length;
    
    let courseCompleted = false;
    if (watchedCount >= totalCount && totalCount > 0) {
      courseCompleted = true;
      await dynamoVideoService.recordCourseCompletion(userId, courseName);

    }
    
    res.json({ 
      success: true, 
      message: 'Video marked as watched',
      courseCompleted,
      progress: { watched: watchedCount, total: totalCount }
    });
  } catch (err) {
    console.error('Error marking video as watched:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.syncVideos = async (req, res) => {
  try {
    // Sync logic here
    res.json({ success: true, message: 'Videos synced successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.addVideo = async (req, res) => {
  try {
    const { courseName, ...videoData } = req.body;
    const success = await dynamoVideoService.addVideoToCourse(courseName, videoData);
    if (success) {
      res.json({ success: true, message: 'Video added successfully to DynamoDB/Local Storage' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to add video' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getVideoCount = async (req, res) => {
  try {
    const { courseName } = req.params;
    const userId = req.user?.email || req.session?.user?.email;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const count = await dynamoVideoService.getVideoCount(courseName, userId);
    res.json({ success: true, data: count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getWatchDates = async (req, res) => {
  try {
    const userId = req.user?.email || req.session?.user?.email;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const watchDates = await dynamoVideoService.getWatchDates(userId);
    res.json(watchDates);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
exports.getLocalStorageFormat = async (req, res) => {
  try {
    const courses = await dynamoVideoService.getAllCourses();
    const localStorageFormat = {};
    courses.forEach(course => {
      localStorageFormat[course.name] = {
        videos: course.videos || []
      };
    });
    res.json(localStorageFormat);
  } catch (error) {
    console.error('Error getting localStorage format:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getStreamUrl = async (req, res) => {
  try {
    const { videoKey } = req.body;
    const signedUrl = await s3VideoService.generateSignedUrl(`https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/${videoKey}`);
    res.json({ success: true, streamUrl: signedUrl });
  } catch (error) {
    console.error('Error generating stream URL:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getNextVideo = async (req, res) => {
  try {
    const { currentVideoId, courseName, direction } = req.query;
    const userId = req.user?.email || req.session?.user?.email;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const videos = await dynamoVideoService.getVideosForCourse(courseName, userId);
    const currentIndex = videos.findIndex(v => (v.videoId === currentVideoId) || (v._id && v._id.toString() === currentVideoId));
    
    let targetVideo = null;
    if (direction === 'prev' && currentIndex > 0) {
      targetVideo = videos[currentIndex - 1];
    } else if (direction === 'next' && currentIndex < videos.length - 1) {
      targetVideo = videos[currentIndex + 1];
    }
    
    if (targetVideo && (targetVideo.videoId || targetVideo._id)) {
      res.json(targetVideo);
    } else {
      res.status(404).json({ error: 'No video found' });
    }
  } catch (error) {
    console.error('Navigation error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.markVideoWatchedEnhanced = async (req, res) => {
  try {
    const { videoId, courseName } = req.body;
    const userId = req.user?.email || 'guest';
    
    // 🏆 Point Awarding Protocol: Fetch BEFORE updating status to check "is first watch"
    let gamificationData = await dynamoVideoService.getUserGamificationData(userId);
    const isFirstWatch = !gamificationData.userStats.videosWatched[videoId];
    
    const success = await dynamoVideoService.updateVideoWatchStatus(courseName, videoId, true, userId);
    
    if (success) {
      let awardedPoints = 0;
      if (isFirstWatch) {
        // Award Base Points (100)
        const baseXP = 100;
        gamificationData.userStats.totalPoints += baseXP;
        gamificationData.userStats.experiencePoints = (gamificationData.userStats.experiencePoints || 0) + baseXP;
        awardedPoints += baseXP;
        
        // Mark as watched in gamification object (dynamoVideoService.updateVideoWatchStatus also does this internally, so we re-fetch or sync)
        gamificationData.userStats.videosWatched[videoId] = true;
        
        // Calculate Achievements
        const watchedCount = Object.keys(gamificationData.userStats.videosWatched).length;
        const newAchievements = [];
        
        if (watchedCount === 1) newAchievements.push({ id: 'getting-started', title: 'Getting Started', points: 10 });
        if (watchedCount === 5) newAchievements.push({ id: 'video-enthusiast', title: 'Video Enthusiast', points: 25 });
        if (watchedCount === 10) newAchievements.push({ id: 'learning-streak', title: 'Learning Streak', points: 50 });
        
        newAchievements.forEach(achievement => {
          if (!gamificationData.achievements.find(a => a.id === achievement.id)) {
            gamificationData.achievements.push({ ...achievement, unlockedAt: new Date().toISOString() });
            gamificationData.userStats.totalPoints += achievement.points;
            gamificationData.userStats.experiencePoints = (gamificationData.userStats.experiencePoints || 0) + achievement.points;
            awardedPoints += achievement.points;
          }
        });
        
        // Update Level based on Experience Points: Level = floor(sqrt(XP/100)) + 1
        const exp = gamificationData.userStats.experiencePoints || 0;
        gamificationData.userStats.currentLevel = Math.floor(Math.sqrt(exp / 100)) + 1;
        
        // PERSIST with schema enforcement
        await dynamoVideoService.updateUserGamificationData(userId, gamificationData);
      }

      res.json({ 
        success, 
        pointsAwarded: awardedPoints, 
        totalPoints: gamificationData.userStats.totalPoints,
        experiencePoints: gamificationData.userStats.experiencePoints,
        currentLevel: gamificationData.userStats.currentLevel,
        message: 'Video marked as watched' 
      });
    } else {
      res.json({ success, message: 'Failed to mark watched' });
    }
  } catch (error) {
    console.error('Error in markVideoWatchedEnhanced:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// --- NEW (Google UI/UX Designer): Video Processing Status ---
exports.getVideoStatus = async (req, res) => {
  try {
    const { videoId } = req.params;
    const dynamodb = require('../utils/dynamodb');
    
    // Use the GSI optimized global lookup
    const video = await dynamodb.getVideoGlobally(videoId);
    
    if (!video) {
      return res.status(404).json({ success: false, error: 'Video not found in ingestion pipeline' });
    }

    // Map DynamoDB state to simplified UI progress
    const status = {
      videoId: video.videoId,
      title: video.title,
      currentStep: video.processingError ? 'ERROR' : (video.processedAt ? 'COMPLETED' : 'PROCESSING'),
      progress: video.processedAt ? 100 : (video.captionsReady ? 66 : 33),
      details: {
        captions: !!video.captionsReady,
        quiz: !!video.quizReady,
        summary: !!video.summaryReady,
        error: video.processingError || null
      }
    };

    res.json({ success: true, status });
  } catch (err) {
    console.error('Error fetching video status:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
// --- NEW (Senior Data Engineer): Activity Pulse Lookup ---
exports.getWatchDates = async (req, res) => {
  try {
    const userId = req.user?.email || 'guest';
    const dates = await dynamoVideoService.getWatchDates(userId);
    res.json(dates);
  } catch (err) {
    console.error('Error fetching watch dates:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
