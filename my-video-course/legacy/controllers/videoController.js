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
const Video = require('../models/Video');

exports.getVideos = async (req, res) => {
  try {
    const videos = await Video.find();
    const totalVideos = videos.length;
    const watchedVideos = videos.filter(video => video.watched).length;

    res.render('index', { videos, totalVideos, watchedVideos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllVideos = async (req, res) => {
  try {
    const videos = await Video.find();
    
    res.render('dashboard', { videos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getVideoById = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);

    if (!video || !video.videoUrl) {
      return res.status(404).send('Video not found');
    }

    // Ensure the videoUrl is prefixed with a slash for public access
    video.videoUrl = `/${video.videoUrl}`;

    // Render the video page
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
    const video = await Video.findById(videoId);
    const videos = await Video.find();

    // Mark the current video as watched
    video.watched = true;
    video.watchedAt = new Date(); // Set the current date and time
    await video.save();

    // Find the index of the current video
    const currentIndex = videos.findIndex(v => v._id.toString() === videoId);

    // Determine the next video, if it exists
    const nextVideo = currentIndex < videos.length - 1 ? videos[currentIndex + 1] : null;

    // Redirect to the next video or to the dashboard if no more videos
    if (nextVideo) {
      res.redirect(`/videos/${nextVideo._id}`);
    } else {
      res.redirect(`/videos/${req.params.id}`); // Or any other endpoint you want to redirect to after the last video
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
