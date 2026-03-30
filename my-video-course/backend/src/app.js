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
  path.join(__dirname, '../../frontend/src'),
  path.join(__dirname, '../../frontend/src/pages'),
  path.join(__dirname, '../../frontend/views')
]);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

const DynamoDBStore = require('connect-dynamodb')(session);

const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
const store = new DynamoDBStore({
  table: `video-course-app-sessions-${environment}`,
  AWSConfigJSON: {
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  },
  cleanupInterval: 600000 // 10 minutes
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: true, 
  saveUninitialized: false,
  store: store,
  proxy: true, 
  name: 'multitouch.sid',
  cookie: {
    secure: process.env.NODE_ENV === 'production' && !process.env.LOCAL_DEV,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 
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
app.get('/admin', (req, res) => authController.renderAdminLogin(req, res));
app.post('/admin/auth', (req, res) => authController.adminAuth(req, res));
app.get('/logout', (req, res) => authController.logout(req, res));

// ── VIDEO & COURSE ROUTES ─────────────────────────────────────────────
app.get('/dashboard', sessionAuth, (req, res) => webController.renderDashboard(req, res));
app.get('/courses', sessionAuth, (req, res) => webController.renderCourses(req, res));
app.get('/course/:courseName', sessionAuth, (req, res) => webController.renderCourse(req, res));
app.get('/video/:courseName', sessionAuth, (req, res) => webController.renderVideo(req, res));
app.get('/course/:courseName/video/:videoId?', sessionAuth, (req, res) => webController.renderVideo(req, res));
app.get('/videos/:courseName/:videoId', sessionAuth, (req, res) => webController.renderVideo(req, res));
app.post('/api/mark-watched', sessionAuth, (req, res) => videoController.markVideoWatchedEnhanced(req, res));

// ── FILE SERVING ROUTES ──────────────────────────────────────────────
app.get('/pdf/*', sessionAuth, (req, res) => webController.servePdf(req, res));
app.get('/captions/:courseName/:id', sessionAuth, (req, res) => webController.serveCaptions(req, res));
app.get('/download-srt/:filename', sessionAuth, (req, res) => webController.downloadSrt(req, res));
app.get('/subtitles/:courseName/:videoTitle.srt', sessionAuth, (req, res) => webController.serveSubtitles(req, res));
app.get('/videos/:courseName/file/:id', sessionAuth, (req, res) => webController.streamVideo(req, res));

// ── ADMIN & TEACHER ROUTES ─────────────────────────────────────────────
app.get('/admin/super', sessionAuth, (req, res) => adminController.renderSuperDashboard(req, res));
app.get('/admin/course-manager', sessionAuth, (req, res) => adminController.renderCourseManager(req, res));
app.get('/admin/teacher-requests', sessionAuth, (req, res) => adminController.renderTeacherRequests(req, res));
app.get('/admin/analytics', sessionAuth, (req, res) => adminController.renderAnalytics(req, res));
app.get('/admin/tools', sessionAuth, (req, res) => adminController.renderAdminPanel(req, res));

app.post('/api/admin/users/:id/deactivate', sessionAuth, (req, res) => adminController.deactivateUser(req, res));
app.post('/api/admin/users/:id/reactivate', sessionAuth, (req, res) => adminController.reactivateUser(req, res));
app.delete('/api/admin/courses/:id', sessionAuth, (req, res) => adminController.deleteCourse(req, res));

// ── USER PROFILE & CERTIFICATE ROUTES ──────────────────────────────────
app.get('/profile', sessionAuth, (req, res) => webController.renderProfile(req, res));
app.get('/certificates', sessionAuth, (req, res) => webController.renderCertificates(req, res));

// ── MODULARIZED ROUTES ───────────────────────────────────────────────
app.use('/api/auth', require('./routes/api/auth'));
app.use('/teacher', sessionAuth, require('./routes/teacher'));
app.use('/api/teacher', sessionAuth, require('./routes/api/teacher'));
app.use('/api/courses', sessionAuth, require('./routes/api/courses'));
app.use('/api/upload', sessionAuth, require('./routes/api/upload'));
app.use('/api/enrollments', sessionAuth, require('./routes/api/enrollments'));
app.use('/api/wishlist', sessionAuth, require('./routes/api/wishlist'));
app.use('/api/quizzes', sessionAuth, require('./routes/api/quizzes'));
app.use('/api/ai', sessionAuth, require('./routes/api/ai'));
app.use('/api/certificates', sessionAuth, require('./routes/api/certificates'));

// ── PREVIOUSLY UNREGISTERED ROUTES (Internal Server Error Fix) ────────
app.use('/api/learning', sessionAuth, require('./routes/api/learning'));
app.use('/api/videos', require('./routes/api/videos'));
app.use('/api/gamification', sessionAuth, require('./routes/api/gamification'));
app.use('/api/captions', sessionAuth, require('./routes/api/captions'));
app.use('/api/sync', sessionAuth, require('./routes/api/sync'));
// NOTE: routes/api/users.js and routes/api/admin.js depend on legacy Mongoose
// models (../../models/User, TeacherRequest) removed during DynamoDB migration.
// They are intentionally excluded until rewritten to use dynamodb utils.

// ── GLOBAL 404 HANDLER ───────────────────────────────────────────────
app.use((req, res) => {
  if (req.accepts('json') && req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found', path: req.path });
  }
  res.status(404).render('error', { message: `Page not found: ${req.path}` });
});

// ── GLOBAL ERROR HANDLER ─────────────────────────────────────────────
// This catch-all must be the LAST middleware (4 arguments = Express error handler)
app.use((err, req, res, next) => {
  console.error('🔴 Unhandled Server Error:', err.stack || err.message);
  const status = err.status || err.statusCode || 500;
  if (req.accepts('json') && req.path.startsWith('/api/')) {
    return res.status(status).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
    });
  }
  res.status(status).render('error', {
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
});

module.exports = app;