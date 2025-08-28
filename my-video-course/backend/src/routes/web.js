const express = require('express');
const router = express.Router();
const webController = require('../controllers/webController');
const authController = require('../controllers/authController');
const uploadController = require('../controllers/uploadController');

// Auth routes
router.get('/login', (req, res) => authController.renderLogin(req, res));
router.get('/signup', (req, res) => authController.renderSignup(req, res));

// Main routes
router.get('/', (req, res) => webController.redirectToDashboard(req, res));
router.get('/dashboard', (req, res) => {
  res.render('pages/dashboard');
});
router.get('/course/:courseName', (req, res) => webController.renderCourse(req, res));
router.get('/course/:courseName/video/:videoId?', (req, res) => webController.renderVideo(req, res));
router.get('/videos/:courseName', (req, res) => webController.redirectToCourse(req, res));
router.get('/videos/:courseName/:id', (req, res) => webController.renderVideoById(req, res));
router.get('/watch/:videoUrl', (req, res) => webController.redirectToVideo(req, res));

// Static pages
router.get('/profile', (req, res) => webController.renderProfile(req, res));
router.get('/settings', (req, res) => webController.renderSettings(req, res));
router.get('/chatbot', (req, res) => webController.renderChatbot(req, res));
router.get('/test-quiz', (req, res) => webController.renderTestQuiz(req, res));

// Upload routes
router.get('/upload', (req, res) => uploadController.renderUpload(req, res));

// Admin routes
router.get('/admin/courses', (req, res) => webController.renderAdminCourses(req, res));

// File serving routes
router.get('/pdf/*', (req, res) => webController.servePdf(req, res));
router.get('/subtitles/:courseName/:videoTitle.srt', (req, res) => webController.serveSubtitles(req, res));
router.get('/captions/:courseName/:id', (req, res) => webController.serveCaptions(req, res));
router.get('/download-srt/:filename', (req, res) => webController.downloadSrt(req, res));
router.get('/videos/:courseName/file/:id', (req, res) => webController.streamVideo(req, res));

module.exports = router;