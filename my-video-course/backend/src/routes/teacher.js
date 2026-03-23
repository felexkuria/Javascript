const express = require('express');
const router = express.Router();
const sessionAuth = require('../middleware/sessionAuth');

const teacherAuth = (req, res, next) => {
  const user = req.user || req.session?.user;
  const userRole = user?.role;
  
  if (userRole !== 'teacher' && userRole !== 'admin') {
    console.log(`🚫 Access Denied for role: ${userRole}`);
    return res.redirect('/dashboard');
  }
  next();
};

const teacherController = require('../controllers/teacherController');

router.get('/dashboard', sessionAuth, teacherAuth, (req, res) => {
  teacherController.renderDashboard(req, res);
});

router.get('/course-editor/:id', sessionAuth, teacherAuth, (req, res) => {
  teacherController.renderCourseEditor(req, res);
});

router.get('/course-new', sessionAuth, teacherAuth, (req, res) => {
  teacherController.renderNewCourseForm(req, res);
});

router.post('/course-new', sessionAuth, teacherAuth, (req, res) => {
  teacherController.createNewCourse(req, res);
});

router.get('/upload-center', sessionAuth, teacherAuth, (req, res) => {
  teacherController.renderUploadCenter(req, res);
});

router.get('/enterprise-upload', sessionAuth, teacherAuth, (req, res) => {
  res.render('teacher-upload-enterprise', { user: req.user });
});

module.exports = router;