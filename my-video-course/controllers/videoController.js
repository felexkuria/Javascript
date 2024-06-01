const Video = require('../models/Video');

exports.getAllVideos = async (req, res) => {
  const videos = await Video.find();
  res.render('dashboard', { videos });
};

exports.getVideoById = async (req, res) => {
  const video = await Video.findById(req.params.id);
  res.render('video', { video });
};

exports.markVideoAsWatched = async (req, res) => {
  await Video.findByIdAndUpdate(req.params.id, { watched: true });
  res.redirect('/videos');
};
