const express = require('express');
const router = express.Router();
const User = require('../../models/User');

// Get user profile
router.get('/profile', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({
      success: true,
      data: {
        name: user.name,
        email: user.email,
        roles: user.roles,
        currentRole: user.roles[0]
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Request teacher access
router.post('/request-teacher', async (req, res) => {
  try {
    const TeacherRequest = require('../../models/TeacherRequest');
    const user = await User.findOne({ email: req.user.email });
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    if (user.roles.includes('teacher')) {
      return res.json({ success: false, error: 'You already have teacher access' });
    }
    
    // Check if request already exists
    const existingRequest = await TeacherRequest.findOne({ userId: user._id });
    if (existingRequest) {
      return res.json({ success: false, error: 'Request already submitted' });
    }
    
    await TeacherRequest.create({
      userId: user._id,
      email: user.email,
      name: user.name,
      status: 'pending'
    });
    
    res.json({
      success: true,
      message: 'Teacher access request submitted successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update user roles (admin only)
router.post('/roles', async (req, res) => {
  try {
    const { email, roles } = req.body;
    
    const user = await User.findOneAndUpdate(
      { email },
      { roles },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({
      success: true,
      data: user,
      message: 'User roles updated successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;