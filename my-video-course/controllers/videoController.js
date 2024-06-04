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
    res.render('video', { video });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// exports.markVideoAsWatched = async (req, res) => {
//   try {
//     const video = await Video.findById(req.params.id);
//     video.watched = true;
//     video.watchedAt = new Date(); // Set the current date and time
//     await video.save();
//     res.redirect(`/videos/${req.params.id}`);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };
exports.markVideoAsWatched = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    const videos = await Video.find();
    video.watched = true;
    video.watchedAt = new Date(); // Set the current date and time
    await video.save();
    // Redirect to the dashboard page after marking the video as watched
    res.render('dashboard', { videos });
    // res.redirect(`/videos/${req.params.id}`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
