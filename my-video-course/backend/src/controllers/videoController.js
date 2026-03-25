const dynamoVideoService = require('../services/dynamoVideoService');
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
    const totalVideos = allVideos.length;
    const watchedVideos = allVideos.filter(video => video.watched).length;

    res.render('videos', { videos: allVideos, totalVideos, watchedVideos });
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
    
    res.render('dashboard', { videos });
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
    const allVideos = courses.flatMap(course => course.videos);
    const video = allVideos.find(v => (v._id || v.id || '').toString() === req.params.id);

    if (!video || !video.videoUrl) {
      return res.status(404).send('Video not found');
    }

    video.videoUrl = `/${video.videoUrl}`;
    res.render('video', { video });
  } catch (err) {
    console.error('Error fetching video:', err);
    res.status(500).send('Internal Server Error');
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
    res.json({ success: true, data: videos });
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
    res.json({ success: true, data: video });
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
    const gamificationManager = require('../services/gamificationManager');
    await gamificationManager.recordVideoWatch(userId, courseName, video.title);
    await gamificationManager.updateStreak(userId);
    
    // Check if course is completed
    const allVideos = await dynamoVideoService.getVideosForCourse(courseName, userId);
    const watchedCount = allVideos.filter(v => v.watched).length + 1; // +1 for current video
    const totalCount = allVideos.length;
    
    let courseCompleted = false;
    if (watchedCount >= totalCount && totalCount > 0) {
      courseCompleted = true;
      await gamificationManager.recordCourseCompletion(userId, courseName);
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
    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME || 'video-course-bucket-047ad47c',
      Key: videoKey
    });
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
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
    const success = await dynamoVideoService.updateVideoWatchStatus(courseName, videoId, true, userId);
    
    if (success) {
      const gamificationData = await dynamoVideoService.getUserGamificationData(userId) || {
        userStats: { totalPoints: 0, videosWatched: {}, currentLevel: 1 },
        achievements: [],
        streakData: { currentStreak: 0 }
      };
      
      if (!gamificationData.userStats.videosWatched[videoId]) {
        gamificationData.userStats.totalPoints = (gamificationData.userStats.totalPoints || 0) + 10;
        gamificationData.userStats.videosWatched[videoId] = true;
        
        const watchedCount = Object.keys(gamificationData.userStats.videosWatched).length;
        const newAchievements = [];
        
        if (watchedCount === 1) newAchievements.push({ id: 'getting-started', title: 'Getting Started', points: 10 });
        if (watchedCount === 5) newAchievements.push({ id: 'video-enthusiast', title: 'Video Enthusiast', points: 25 });
        if (watchedCount === 10) newAchievements.push({ id: 'learning-streak', title: 'Learning Streak', points: 50 });
        
        newAchievements.forEach(achievement => {
          if (!gamificationData.achievements.find(a => a.id === achievement.id)) {
            gamificationData.achievements.push({ ...achievement, unlockedAt: new Date().toISOString() });
            gamificationData.userStats.totalPoints += achievement.points;
          }
        });
        
        await dynamoVideoService.updateUserGamificationData(userId, gamificationData);
      }
    }
    res.json({ success, message: success ? 'Video marked as watched' : 'Failed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
