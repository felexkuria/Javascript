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



module.exports = router;