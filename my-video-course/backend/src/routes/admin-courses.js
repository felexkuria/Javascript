const express = require('express');
const courseService = require('../services/courseService');

const router = express.Router();

// Admin course management page (auth handled by app.js middleware)
router.get('/', async (req, res) => {
  try {
    res.render('admin-courses', {
      title: 'Course Management - Admin',
      user: { isAdmin: true }
    });
  } catch (error) {
    console.error('Error loading admin courses page:', error);
    res.status(500).render('error', { 
      message: 'Failed to load admin page',
      error: error 
    });
  }
});

module.exports = router;