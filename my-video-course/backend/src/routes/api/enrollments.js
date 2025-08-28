const express = require('express');
const router = express.Router();
const Enrollment = require('../../models/Enrollment');
const Course = require('../../models/Course');
const User = require('../../models/User');

// Enroll in a course
router.post('/', async (req, res) => {
  try {
    const { courseId } = req.body;
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    if (!courseId) {
      return res.status(400).json({ success: false, error: 'Course ID is required' });
    }

    // Check if already enrolled
    const existingEnrollment = await Enrollment.findOne({ userId: userEmail, courseId });
    if (existingEnrollment) {
      return res.status(400).json({ success: false, error: 'Already enrolled in this course' });
    }

    // Create enrollment
    const enrollment = new Enrollment({
      userId: userEmail,
      courseId,
      enrolledAt: new Date(),
      status: 'active'
    });

    await enrollment.save();
    
    // Update course enrollment count
    try {
      const Course = require('../../models/Course');
      await Course.findOneAndUpdate(
        { $or: [{ _id: courseId }, { name: courseId }] },
        { $inc: { enrollments: 1 } }
      );
    } catch (err) {
      console.log('Course enrollment count update failed:', err.message);
    }

    res.json({
      success: true,
      message: 'Successfully enrolled in course',
      data: enrollment
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

    const enrollments = await Enrollment.find({ userId: userEmail })
      .populate('courseId', 'title description thumbnail')
      .sort({ enrolledAt: -1 });

    res.json({
      success: true,
      data: enrollments
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

    const enrollment = await Enrollment.findOne({ userId: userEmail, courseId });

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