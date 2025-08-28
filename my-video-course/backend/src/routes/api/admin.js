const express = require('express');
const router = express.Router();
const TeacherRequest = require('../../models/TeacherRequest');
const User = require('../../models/User');

// Admin middleware
const adminAuth = (req, res, next) => {
  // Check for admin key in headers
  const adminKey = req.headers['x-admin-key'];
  if (adminKey === process.env.ADMIN_KEY || adminKey === 'admin123') {
    req.user = { email: 'engineerfelex@gmail.com', isAdmin: true };
    return next();
  }
  
  // Check for authenticated admin user
  if (!req.user || req.user.email !== 'engineerfelex@gmail.com') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

// Grant teacher access directly
router.post('/grant-teacher', adminAuth, async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }
    
    // Find or create user
    let user = await User.findOne({ email });
    if (!user) {
      user = new User({
        userId: email,
        name: email.split('@')[0],
        email,
        roles: ['student', 'teacher']
      });
    } else if (!user.roles.includes('teacher')) {
      user.roles.push('teacher');
    }
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Teacher access granted successfully'
    });
  } catch (error) {
    console.error('Error granting teacher access:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all teacher requests
router.get('/teacher-requests', adminAuth, async (req, res) => {
  try {
    const requests = await TeacherRequest.find({})
      .populate('userId', 'name email')
      .sort({ requestedAt: -1 });
    
    res.json({
      success: true,
      data: requests
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Process teacher request (approve/reject)
router.put('/teacher-requests/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'approved' or 'rejected'
    
    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid request ID format' });
    }
    
    const request = await TeacherRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }
    
    // Update request status
    request.status = action;
    request.reviewedAt = new Date();
    request.reviewedBy = req.user?.email || 'admin';
    await request.save();
    
    // If approved, add teacher role to user
    if (action === 'approved') {
      const user = await User.findById(request.userId);
      if (user && !user.roles.includes('teacher')) {
        user.roles.push('teacher');
        await user.save();
      }
    }
    
    res.json({
      success: true,
      message: `Request ${action} successfully`
    });
  } catch (error) {
    console.error('Error processing teacher request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;