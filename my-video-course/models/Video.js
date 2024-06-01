// models/Video.js
const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  title: String,
  description: String,
  videoUrl: String,
  watched: { type: Boolean, default: false },
  watchedAt: { type: Date, default: null } // Field to store the timestamp when the video is marked as watched
});

module.exports = mongoose.model('Video', videoSchema);
