// const Video = require('../models/Video');

// exports.getAllVideos = async (req, res) => {
//   const videos = await Video.find();
//   res.render('dashboard', { videos });
// };

// exports.getVideoById = async (req, res) => {
//   const video = await Video.findById(req.params.id);
//   res.render('video', { video });
// };

// exports.markVideoAsWatched = async (req, res) => {
//   await Video.findByIdAndUpdate(req.params.id, { watched: true });
//   res.redirect('/videos');
// };


// controllers/videoController.js
const dynamoVideoService = require('../services/dynamoVideoService');

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
    const video = allVideos.find(v => v._id.toString() === req.params.id);

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

// exports.markVideoAsWatched = async (req, res) => {
//   try {
//     const video = await Video.findById(req.params.id);
//     video.watched = true;
//     video.watchedAt = new Date(); // Set the current date and time
//     await video.save();
    // res.redirect(`/videos/${req.params.id}`);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };
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
    const video = allVideos.find(v => v._id.toString() === videoId);

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Mark video as watched for this user
    await dynamoVideoService.updateVideoWatchStatus(video.courseName, videoId, true, userId);

    const currentIndex = allVideos.findIndex(v => v._id.toString() === videoId);
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
    const video = new Video(req.body);
    await video.save();
    res.json({ success: true, data: video });
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
