const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  title: String,
  description: String,
  path: String,
  watched: { type: Boolean, default: false }
});

module.exports = mongoose.model('Video', videoSchema);
