const express = require('express');
const router = express.Router();
const dynamoVideoService = require('../services/dynamoVideoService');

router.get('/', async (req, res) => {
  try {
    const userId = req.user?.email || req.session?.user?.email || 'guest';
    const courses = await dynamoVideoService.getAllCourses(userId);
    const videos = courses.flatMap(c => c.videos || []);
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