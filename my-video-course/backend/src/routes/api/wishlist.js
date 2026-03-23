const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const Course = require('../../models/Course');

// Add a course to wishlist
router.post('/add', async (req, res) => {
  try {
    const { courseId } = req.body;
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    // Find course to verify it exists and get its ObjectId
    const course = await Course.findOne({ 
      $or: [{ _id: mongoose.Types.ObjectId.isValid(courseId) ? courseId : null }, { title: courseId }, { name: courseId }] 
    });

    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (user.wishlist.includes(course._id)) {
      return res.json({ success: true, message: 'Course already in wishlist' });
    }

    user.wishlist.push(course._id);
    await user.save();

    res.json({ success: true, message: 'Added to wishlist' });
  } catch (error) {
    console.error('Wishlist add error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove from wishlist
router.post('/remove', async (req, res) => {
  try {
    const { courseId } = req.body;
    const userEmail = req.user?.email;

    const user = await User.findOne({ email: userEmail });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    user.wishlist = user.wishlist.filter(id => id.toString() !== courseId);
    await user.save();

    res.json({ success: true, message: 'Removed from wishlist' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get wishlist items
router.get('/', async (req, res) => {
  try {
    const userEmail = req.user?.email;
    const user = await User.findOne({ email: userEmail }).populate('wishlist');
    
    res.json({ success: true, wishlist: user?.wishlist || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const mongoose = require('mongoose');
module.exports = router;
