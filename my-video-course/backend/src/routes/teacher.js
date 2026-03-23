const express = require('express');
const router = express.Router();
const sessionAuth = require('../middleware/sessionAuth');

const teacherAuth = (req, res, next) => {
  // Check the standard 'role' field from the User model
  const userRole = req.user?.role;
  if (userRole !== 'teacher' && userRole !== 'admin') {
    return res.redirect('/dashboard');
  }
  next();
};

router.get('/dashboard', sessionAuth, teacherAuth, (req, res) => {
  res.render('teacher-dashboard', { user: req.user });
});

router.get('/upload-center', sessionAuth, teacherAuth, (req, res) => {
  res.render('teacher-upload-center', { user: req.user });
});

router.get('/enterprise-upload', sessionAuth, teacherAuth, (req, res) => {
  res.render('teacher-upload-enterprise', { user: req.user });
});

module.exports = router;