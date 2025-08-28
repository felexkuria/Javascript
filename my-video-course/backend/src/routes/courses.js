const express = require('express');
const router = express.Router();
const courseService = require('../services/courseService');

router.get('/', async (req, res) => {
  try {
    const courses = await courseService.getAllCourses();
    res.render('courses', { 
      title: 'All Courses',
      courses: courses || []
    });
  } catch (error) {
    res.render('courses', { 
      title: 'All Courses',
      courses: [],
      error: 'Failed to load courses'
    });
  }
});

module.exports = router;