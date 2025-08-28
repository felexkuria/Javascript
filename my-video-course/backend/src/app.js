const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// View engine
app.set('view engine', 'ejs'); 
app.set('views', path.join(__dirname, '../../frontend/src'));

// Static files - Clean public folder with assets only
app.use(express.static(path.join(__dirname, '../../public')));
app.use('/videos', express.static(path.join(__dirname, '../../frontend/public/videos')));
app.use('/css', express.static(path.join(__dirname, '../../public/css')));
app.use('/js', express.static(path.join(__dirname, '../../public/js')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Admin Routes
app.use('/admin/login', require('./routes/admin-login'));
app.use('/admin/courses', require('./middleware/adminCognitoAuth'), require('./routes/admin-courses'));

// Public Routes (NO AUTH REQUIRED)
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.render('pages/login', { error: null }));
app.get('/signup', (req, res) => res.render('pages/signup', { error: null }));
app.get('/forgot-password', (req, res) => res.render('pages/forgot-password', { error: null }));

// Public API Routes (NO AUTH REQUIRED)
app.use('/api/auth', require('./routes/api/auth'));
app.use('/api/sync', require('./routes/api/sync'));
app.use('/api/migrate', require('./routes/api/migrate'));
app.use('/api/dynamodb', require('./routes/api/dynamodb'));

// Video streaming routes (NO AUTH REQUIRED for direct file access)
app.get('/videos/:courseName/file/:id', (req, res) => {
  const webController = require('./controllers/webController');
  webController.streamVideo(req, res);
});

// Auth Middleware
const adminAuth = require('./middleware/adminAuth');
const cognitoAuth = require('./middleware/cognitoAuth');
const sessionAuth = require('./middleware/sessionAuth');

// Admin/Teacher API Routes (protected)
const teacherOrAdminAuth = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey === process.env.ADMIN_KEY || adminKey === 'admin123') {
    return next();
  }
  if (req.user?.isTeacher) {
    return next();
  }
  res.status(403).json({ error: 'Admin or teacher access required' });
};

// Course API - Enhanced for admin
const courseController = require('./controllers/courseController');
app.post('/api/courses', teacherOrAdminAuth, (req, res) => courseController.createCourse(req, res));
app.put('/api/courses/:id', teacherOrAdminAuth, (req, res) => courseController.updateCourse(req, res));
app.delete('/api/courses/:id', teacherOrAdminAuth, (req, res) => courseController.deleteCourse(req, res));
app.post('/api/courses/:courseId/upload-video', teacherOrAdminAuth, courseController.upload.single('video'), (req, res) => courseController.uploadVideo(req, res));
app.get('/api/courses', (req, res) => courseController.getAllCourses(req, res));
app.get('/api/courses/:name', (req, res) => courseController.getCourseByName(req, res));
app.get('/api/analytics', teacherOrAdminAuth, (req, res) => courseController.getAnalytics(req, res));
app.use('/api/upload', teacherOrAdminAuth, require('./routes/api/upload'));
app.use('/api/system', adminAuth, require('./routes/api/system'));
app.use('/api/videos/fix-numbering', adminAuth, require('./routes/api/videos-fix'));
app.use('/api/videos-manage', teacherOrAdminAuth, require('./routes/api/videos-manage'));

// Admin API Routes
app.use('/api/admin-auth', require('./routes/api/admin-auth'));
app.use('/api/admin', cognitoAuth, require('./routes/api/admin'));

// Protected API Routes
app.use('/api/videos', cognitoAuth, require('./routes/api/videos'));
app.use('/api/video-proxy', cognitoAuth, require('./routes/api/video-proxy'));
app.use('/api/gamification', cognitoAuth, require('./routes/api/gamification'));
app.use('/api/ai', cognitoAuth, require('./routes/api/ai'));
app.use('/api/users', cognitoAuth, require('./routes/api/users'));
app.use('/api/enrollments', cognitoAuth, require('./routes/api/enrollments'));

// Test upload page
app.get('/test-upload', (req, res) => {
  res.sendFile(path.join(__dirname, '../../test-upload.html'));
});

// Teacher Routes
const teacherController = require('./controllers/teacherController');
app.get('/teacher/dashboard', sessionAuth, (req, res) => {
  if (req.user?.isTeacher) {
    return teacherController.renderDashboard(req, res);
  }
  res.redirect('/dashboard');
});
app.use('/teacher', require('./routes/teacher'));

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Protected Web Routes
app.get('/dashboard', sessionAuth, (req, res) => webController.renderDashboard(req, res));
app.get('/student/dashboard', sessionAuth, (req, res) => {
  const teacherController = require('./controllers/teacherController');
  return teacherController.renderStudentDashboard(req, res);
});
app.get('/profile', sessionAuth, (req, res) => webController.renderProfile(req, res));

// Admin teacher requests page
app.get('/admin/teacher-requests', sessionAuth, (req, res) => {
  if (req.user?.email !== 'engineerfelex@gmail.com') {
    return res.redirect('/dashboard');
  }
  res.render('admin-teacher-requests');
});

// Admin routes
app.get('/admin/login', (req, res) => res.render('admin-login'));
app.get('/admin/dashboard', sessionAuth, (req, res) => {
  if (req.user?.email !== 'engineerfelex@gmail.com') {
    return res.redirect('/dashboard');
  }
  res.render('admin-dashboard');
});
app.get('/admin/course-manager', sessionAuth, (req, res) => {
  if (req.user?.email !== 'engineerfelex@gmail.com') {
    return res.redirect('/dashboard');
  }
  res.render('admin-course-manager');
});

// Web Routes (protected by session)
app.use('/admin', sessionAuth, require('./routes/admin-courses'));
app.use('/courses', sessionAuth, require('./routes/courses'));
app.use('/videos', sessionAuth, require('./routes/videos'));

// Controllers
const webController = require('./controllers/webController');
app.get('/course/:courseName', sessionAuth, (req, res) => webController.renderCourse(req, res));
app.get('/course/:courseName/video/:videoId?', sessionAuth, (req, res) => webController.renderVideo(req, res));
app.get('/videos/:courseName/:videoId', sessionAuth, (req, res) => webController.renderVideoById(req, res));

module.exports = app;