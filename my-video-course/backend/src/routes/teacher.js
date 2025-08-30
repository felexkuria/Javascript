const express = require('express');
const router = express.Router();
const sessionAuth = require('../middleware/sessionAuth');

const teacherAuth = (req, res, next) => {
  if (!req.user || (!req.user.roles?.includes('teacher') && !req.user.isTeacher)) {
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

module.exports = router;