const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');

// Canonical API endpoints
router.post('/signup', authController.signup);
router.post('/confirm', authController.confirm);
router.post('/signin', authController.signin);
router.post('/logout', authController.logout);
router.post('/forgot-password', authController.forgotPassword);
router.post('/confirm-forgot', authController.confirmForgotPassword);

// AWS Identity Pool credentials endpoint
router.post('/get-temp-credentials', async (req, res) => {
  try {
    // For now, return error to force fallback to backend URLs
    res.status(503).json({ 
      success: false, 
      error: 'Identity Pool temporarily unavailable, using backend fallback' 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;