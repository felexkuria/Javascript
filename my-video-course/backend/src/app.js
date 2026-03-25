const express = require('express');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const fs = require('fs');

// Controllers
const authController = require('./controllers/authController');
const adminController = require('./controllers/adminController');
const systemController = require('./controllers/systemController');
const webController = require('./controllers/webController');
const videoController = require('./controllers/videoController');
const teacherController = require('./controllers/teacherController');

// Middleware
const sessionAuth = require('./middleware/sessionAuth');

const app = express();

// Basic Middleware
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', [
  path.join(__dirname, '../../frontend/src/views'),
  path.join(__dirname, '../../frontend/src/views/pages')
]);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Static Files
app.use(express.static(path.join(__dirname, '../../frontend/public')));
app.use('/uploads', express.static(path.join(__dirname, '../../frontend/public/uploads')));
app.use('/videos', express.static(path.join(__dirname, '../../frontend/public/videos')));

// ── SYSTEM ROUTES ─────────────────────────────────────────────────────
app.get('/health', (req, res) => systemController.healthCheck(req, res));
app.get('/api/gamification/stats', sessionAuth, (req, res) => systemController.getGamificationStats(req, res));
app.get('/api/gamification/load', sessionAuth, (req, res) => systemController.getGamificationLoad(req, res));
app.post('/api/gamification/sync', sessionAuth, (req, res) => systemController.syncGamification(req, res));

// ── AUTH ROUTES ───────────────────────────────────────────────────────
app.get('/', (req, res) => webController.redirectToDashboard(req, res));
app.get('/login', (req, res) => authController.renderLogin(req, res));
app.get('/signup', (req, res) => authController.renderSignup(req, res));
app.get('/forgot-password', (req, res) => authController.renderForgotPassword(req, res));
app.get('/reset-password', (req, res) => authController.renderResetPassword(req, res));
app.post('/admin/auth', (req, res) => authController.adminAuth(req, res));
app.get('/logout', (req, res) => authController.logout(req, res));

// ── VIDEO & COURSE ROUTES ─────────────────────────────────────────────
app.get('/dashboard', sessionAuth, (req, res) => webController.renderDashboard(req, res));
app.get('/course/:courseName', sessionAuth, (req, res) => webController.renderCourse(req, res));
app.get('/course/:courseName/video/:videoId?', sessionAuth, (req, res) => webController.renderVideo(req, res));
app.get('/videos/:courseName/:videoId', sessionAuth, (req, res) => webController.renderVideo(req, res));
app.get('/api/videos/localStorage', (req, res) => videoController.getLocalStorageFormat(req, res));
app.post('/api/videos/stream-url', sessionAuth, (req, res) => videoController.getStreamUrl(req, res));
app.post('/api/mark-watched', sessionAuth, (req, res) => videoController.markVideoWatchedEnhanced(req, res));
app.get('/api/next-video', sessionAuth, (req, res) => videoController.getNextVideo(req, res));

// ── ADMIN & TEACHER ROUTES ─────────────────────────────────────────────
app.get('/admin/super', sessionAuth, (req, res) => adminController.renderSuperDashboard(req, res));
app.get('/admin/course-manager', sessionAuth, (req, res) => adminController.renderCourseManager(req, res));
app.post('/api/admin/users/:id/deactivate', sessionAuth, (req, res) => adminController.deactivateUser(req, res));
app.post('/api/admin/users/:id/reactivate', sessionAuth, (req, res) => adminController.reactivateUser(req, res));
app.delete('/api/admin/courses/:id', sessionAuth, (req, res) => adminController.deleteCourse(req, res));

// ── MODULARIZED ROUTES ───────────────────────────────────────────────
app.use('/api/auth', require('./routes/api/auth'));
app.use('/teacher', sessionAuth, require('./routes/teacher'));
app.use('/api/teacher', sessionAuth, require('./routes/api/teacher'));
app.use('/api/courses', sessionAuth, require('./routes/api/courses'));
app.use('/api/enrollments', sessionAuth, require('./routes/api/enrollments'));
app.use('/api/wishlist', sessionAuth, require('./routes/api/wishlist'));
app.use('/api/quizzes', sessionAuth, require('./routes/api/quizzes'));
app.use('/api/ai', sessionAuth, require('./routes/api/ai'));

module.exports = app;