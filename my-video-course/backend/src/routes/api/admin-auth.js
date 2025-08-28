const express = require('express');
const cognitoService = require('../../services/cognitoService');

const router = express.Router();

// Admin login - send verification code
router.post('/admin-login', async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check if email is admin/instructor
    if (!email.includes('admin') && !email.includes('teacher') && !email.includes('instructor')) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    // Send verification code via Cognito
    await cognitoService.forgotPassword(email);
    
    res.json({
      success: true,
      message: 'Verification code sent to your email'
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to send verification code'
    });
  }
});

// Admin verify code and login
router.post('/admin-verify', async (req, res) => {
  try {
    const { email, code } = req.body;
    
    // For admin login, we'll use a temporary password reset flow
    // In production, implement proper admin MFA
    const tempPassword = 'TempPass123!';
    
    try {
      await cognitoService.confirmForgotPassword(email, code, tempPassword);
      
      // Now login with the temp password
      const loginResult = await cognitoService.signIn(email, tempPassword);
      
      res.json({
        success: true,
        token: loginResult.token,
        user: loginResult.user,
        message: 'Admin login successful'
      });
    } catch (error) {
      // If user doesn't exist, create admin account
      if (error.message.includes('UserNotFoundException')) {
        await cognitoService.signUp(email, tempPassword, email.split('@')[0]);
        await cognitoService.confirmSignUp(email, code);
        
        const loginResult = await cognitoService.signIn(email, tempPassword);
        
        res.json({
          success: true,
          token: loginResult.token,
          user: loginResult.user,
          message: 'Admin account created and logged in'
        });
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Admin verify error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Invalid verification code'
    });
  }
});

module.exports = router;