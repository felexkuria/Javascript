const express = require('express');
const router = express.Router();
const dynamoVideoService = require('../../services/dynamoVideoService');
const dynamodb = require('../../utils/dynamodb');

// Enroll in a course
router.post('/', async (req, res) => {
  try {
    const { courseId } = req.body; // courseId is likely courseName
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    // 1. Find course in DynamoDB
    const course = await dynamoVideoService.getCourseByTitle(courseId, userEmail);
    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    const courseName = course.name || course.title;

    // 2. Check if already enrolled in DynamoDB
    const enrollments = await dynamoVideoService.getUserEnrollments(userEmail);
    const existing = enrollments.find(e => e.courseName === courseName);
    
    if (existing) {
      return res.status(400).json({ success: false, error: 'Already enrolled in this course' });
    }

    // 3. Create enrollment in DynamoDB
    await dynamoVideoService.enrollUser(userEmail, courseName);
    
    // Update course enrollment count in DynamoDB
    try {
      course.enrollments = (course.enrollments || 0) + 1;
      await dynamodb.saveCourse(course);
    } catch (err) {
      console.log('Course enrollment count update failed:', err.message);
    }

    res.json({
      success: true,
      message: 'Successfully enrolled in course',
      data: { userId: userEmail, courseName, status: 'active' }
    });
  } catch (error) {
    console.error('Error enrolling in course:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user enrollments
router.get('/my-enrollments', async (req, res) => {
  try {
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const enrollments = await dynamoVideoService.getUserEnrollments(userEmail);
    
    // Enrich with course details
    const allCourses = await dynamoVideoService.getAllCourses(userEmail);
    const enriched = enrollments.map(enrol => {
      const course = allCourses.find(c => c.name === enrol.courseName);
      return {
        ...enrol,
        courseId: course // Maintain field name for frontend compat
      };
    });

    res.json({
      success: true,
      data: enriched
    });
  } catch (error) {
    console.error('Error getting enrollments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check enrollment status
router.get('/check/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const course = await dynamoVideoService.getCourseByTitle(courseId, userEmail);
    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    const enrollments = await dynamoVideoService.getUserEnrollments(userEmail);
    const enrollment = enrollments.find(e => e.courseName === (course.name || course.title));

    res.json({
      success: true,
      data: {
        enrolled: !!enrollment,
        enrollment: enrollment || null
      }
    });
  } catch (error) {
    console.error('Error checking enrollment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;