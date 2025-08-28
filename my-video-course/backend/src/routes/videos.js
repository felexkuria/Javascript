const express = require('express');
const router = express.Router();
const videoService = require('../services/videoService');

router.get('/', async (req, res) => {
  try {
    const videos = await videoService.getAllVideos();
    res.render('videos', { 
      title: 'All Videos',
      videos: videos || []
    });
  } catch (error) {
    res.render('videos', { 
      title: 'All Videos', 
      videos: [],
      error: 'Failed to load videos'
    });
  }
});

module.exports = router;