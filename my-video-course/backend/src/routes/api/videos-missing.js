const express = require('express');
const router = express.Router();

// Missing video endpoints
router.get('/localStorage', async (req, res) => {
  try {
    const userId = req.user?.email || 'guest';
    const dynamoVideoService = require('../../services/dynamoVideoService');
    const courses = await dynamoVideoService.getAllCourses(userId);
    
    res.json({
      success: true,
      data: courses
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;