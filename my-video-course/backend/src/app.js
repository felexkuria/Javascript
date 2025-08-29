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

// AWS SDK v3 imports
let S3Client, GetObjectCommand, PutObjectCommand;
try {
  const { S3Client: S3ClientImport, GetObjectCommand: GetObjectCommandImport, PutObjectCommand: PutObjectCommandImport } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  S3Client = S3ClientImport;
  GetObjectCommand = GetObjectCommandImport;
  PutObjectCommand = PutObjectCommandImport;
} catch (error) {
  console.warn('AWS S3 SDK not available:', error.message);
}

// Multer for file uploads
const multer = require('multer');
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

// Simple admin auth for S3 uploads
const simpleAdminAuth = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey === process.env.ADMIN_KEY || adminKey === 'admin123') {
    return next();
  }
  console.log('Auth failed, admin key:', adminKey);
  res.status(403).json({ error: 'Admin access required' });
};

// Course API - Enhanced for admin
const courseController = require('./controllers/courseController');
app.post('/api/courses', teacherOrAdminAuth, (req, res) => courseController.createCourse(req, res));
app.put('/api/courses/:id', teacherOrAdminAuth, async (req, res) => {
  try {
    const courseId = decodeURIComponent(req.params.id);
    const courseData = req.body;
    
    // Update course in DynamoDB
    const dynamoVideoService = require('./services/dynamoVideoService');
    const success = await dynamoVideoService.updateCourse(courseId, courseData);
    
    if (success) {
      res.json({ success: true, message: 'Course updated successfully' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to update course' });
    }
  } catch (error) {
    console.error('Course update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
app.delete('/api/courses/:id', teacherOrAdminAuth, (req, res) => courseController.deleteCourse(req, res));
app.post('/api/courses/:courseId/upload-video', teacherOrAdminAuth, courseController.upload.single('video'), (req, res) => courseController.uploadVideo(req, res));
app.get('/api/courses', (req, res) => courseController.getAllCourses(req, res));
app.get('/api/courses/:name', (req, res) => courseController.getCourseByName(req, res));
app.get('/api/analytics', teacherOrAdminAuth, (req, res) => courseController.getAnalytics(req, res));
app.use('/api/upload', teacherOrAdminAuth, require('./routes/api/upload'));
app.use('/api/system', adminAuth, require('./routes/api/system'));
app.use('/api/videos/fix-numbering', adminAuth, require('./routes/api/videos-fix'));
app.use('/api/videos-manage', teacherOrAdminAuth, require('./routes/api/videos-manage'));

// Update video endpoint
app.put('/api/videos/:courseName/:videoId', teacherOrAdminAuth, async (req, res) => {
  try {
    const { courseName, videoId } = req.params;
    const videoData = req.body;
    
    const dynamoVideoService = require('./services/dynamoVideoService');
    const success = await dynamoVideoService.updateVideo(courseName, videoId, videoData);
    
    if (success) {
      res.json({ success: true, message: 'Video updated successfully' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to update video' });
    }
  } catch (error) {
    console.error('Video update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin API Routes
app.use('/api/admin-auth', require('./routes/api/admin-auth'));
app.use('/api/admin', cognitoAuth, require('./routes/api/admin'));

// Protected API Routes
app.use('/api/videos', cognitoAuth, require('./routes/api/videos'));
app.use('/api/video-proxy', cognitoAuth, require('./routes/api/video-proxy'));
app.use('/api/captions', require('./routes/api/captions'));
app.use('/api/gamification', cognitoAuth, require('./routes/api/gamification'));
app.use('/api/quizzes', cognitoAuth, require('./routes/api/quizzes'));
app.use('/api/ai', cognitoAuth, require('./routes/api/ai'));
app.use('/api/users', cognitoAuth, require('./routes/api/users'));
app.use('/api/enrollments', cognitoAuth, require('./routes/api/enrollments'));

// Video control endpoints
app.post('/api/mark-watched', cognitoAuth, async (req, res) => {
  try {
    const { videoId, courseName } = req.body;
    const userId = req.user?.email || 'guest';
    const dynamoVideoService = require('./services/dynamoVideoService');
    const success = await dynamoVideoService.updateVideoWatchStatus(courseName, videoId, true, userId);
    
    if (success) {
      // Update gamification stats with achievement points
      const gamificationData = await dynamoVideoService.getUserGamificationData(userId) || {
        userStats: { totalPoints: 0, videosWatched: {}, currentLevel: 1 },
        achievements: [],
        streakData: { currentStreak: 0 }
      };
      
      // Add points for watching video
      if (!gamificationData.userStats.videosWatched[videoId]) {
        gamificationData.userStats.totalPoints = (gamificationData.userStats.totalPoints || 0) + 10;
        gamificationData.userStats.videosWatched[videoId] = true;
        
        // Check achievements
        const watchedCount = Object.keys(gamificationData.userStats.videosWatched).length;
        const newAchievements = [];
        
        // Getting Started - First video
        if (watchedCount === 1 && !gamificationData.achievements.find(a => a.id === 'getting-started')) {
          newAchievements.push({ id: 'getting-started', title: 'Getting Started', points: 10 });
        }
        
        // Video Enthusiast - 5 videos
        if (watchedCount === 5 && !gamificationData.achievements.find(a => a.id === 'video-enthusiast')) {
          newAchievements.push({ id: 'video-enthusiast', title: 'Video Enthusiast', points: 25 });
        }
        
        // Learning Streak - 10 videos
        if (watchedCount === 10 && !gamificationData.achievements.find(a => a.id === 'learning-streak')) {
          newAchievements.push({ id: 'learning-streak', title: 'Learning Streak', points: 50 });
        }
        
        // Knowledge Seeker - 25 videos
        if (watchedCount === 25 && !gamificationData.achievements.find(a => a.id === 'knowledge-seeker')) {
          newAchievements.push({ id: 'knowledge-seeker', title: 'Knowledge Seeker', points: 100 });
        }
        
        // Course Master - 50 videos
        if (watchedCount === 50 && !gamificationData.achievements.find(a => a.id === 'course-master')) {
          newAchievements.push({ id: 'course-master', title: 'Course Master', points: 200 });
        }
        
        // Add new achievements
        newAchievements.forEach(achievement => {
          gamificationData.achievements.push({
            ...achievement,
            unlockedAt: new Date().toISOString()
          });
          gamificationData.userStats.totalPoints += achievement.points;
        });
        
        await dynamoVideoService.updateUserGamificationData(userId, gamificationData);
      }
    }
    
    res.json({ success, message: success ? 'Video marked as watched' : 'Failed to mark video' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/next-video', cognitoAuth, async (req, res) => {
  try {
    const { currentVideoId, courseName, direction } = req.query;
    const userId = req.user?.email || 'guest';
    const dynamoVideoService = require('./services/dynamoVideoService');
    const videos = await dynamoVideoService.getVideosForCourse(courseName, userId);
    
    const currentIndex = videos.findIndex(v => v._id.toString() === currentVideoId);
    let targetVideo = null;
    
    if (direction === 'prev' && currentIndex > 0) {
      targetVideo = videos[currentIndex - 1];
    } else if (direction === 'next' && currentIndex < videos.length - 1) {
      targetVideo = videos[currentIndex + 1];
    }
    
    if (targetVideo) {
      res.json(targetVideo);
    } else {
      res.status(404).json({ error: 'No video found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-srt', cognitoAuth, async (req, res) => {
  try {
    const { videoTitle, courseName, videoId } = req.body;
    res.json({ success: true, status: 'processing' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/todos/store', async (req, res) => {
  try {
    const todoProgressData = {
      "AWS CLOUD SOLUTIONS ARCHITECT BOOTCAMP SERIES AWS USER GROUP KAMPALA_AWS CLOUD SOLUTIONS ARCHITECT BOOTCAMP SERIES (AWS USER GROUP KAMPALA)-20250726_100322-Meeting Recording": {
        "cloud_&_iaas_4": {
          "completedAt": null,
          "completed": false
        }
      },
      "AWS Certified Solutions Architect Associate - 2021 [SAA-C02]_1. Introduction and How to use this Course": {
        "srt_1. Introduction and How to use this Course_3": {
          "completedAt": "2025-08-21T06:19:18.716Z",
          "completed": true
        }
      },
      "dev-ops-bootcamp_202201_lesson11": {
        "srt_lesson11_0": {
          "completedAt": "2025-08-15T19:03:13.596Z",
          "completed": true
        },
        "srt_lesson11_2": {
          "completedAt": "2025-08-15T19:03:41.141Z",
          "completed": true
        }
      },
      "dev-ops-bootcamp_202201_lesson10": {
        "srt_lesson10_3": {
          "completedAt": null,
          "completed": false
        }
      },
      "dev-ops-bootcamp_202201_lesson3": {
        "srt_lesson3_0": {
          "completedAt": null,
          "completed": false
        }
      },
      "dev-ops-bootcamp_202201_lesson7": {
        "pdf_7 -Jenkins (Dark Theme).pdf_3": {
          "completedAt": null,
          "completed": false
        }
      },
      "HashiCorp Certified Terraform Associate - Hands-On Labs_001 Course Introduction": {
        "srt_001 Course Introduction_1": {
          "completedAt": null,
          "completed": false
        }
      },
      "dev-ops-bootcamp_202201_lesson9": {
        "pdf_9 - Kubernetes (Dark Theme).pdf_13": {
          "completedAt": null,
          "completed": false
        }
      }
    };
    
    const userId = 'engineerfelex@gmail.com';
    const dynamoVideoService = require('./services/dynamoVideoService');
    
    const gamificationData = await dynamoVideoService.getUserGamificationData(userId) || {};
    gamificationData.todoProgress = todoProgressData;
    
    await dynamoVideoService.updateUserGamificationData(userId, gamificationData);
    res.json({ success: true, message: 'Todo progress stored for engineerfelex@gmail.com' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/todos/:videoTitle', cognitoAuth, async (req, res) => {
  try {
    const { videoTitle } = req.params;
    const userId = req.user?.email || 'guest';
    const dynamoVideoService = require('./services/dynamoVideoService');
    const gamificationData = await dynamoVideoService.getUserGamificationData(userId);
    
    const todos = gamificationData?.todoProgress?.[videoTitle] || {};
    const todoList = Object.keys(todos).map(key => ({
      id: key,
      task: key.replace(/^(srt|pdf)_/, '').replace(/_\d+$/, ''),
      completed: todos[key]?.completed || false,
      completedAt: todos[key]?.completedAt
    }));
    
    res.json({ success: true, todos: todoList });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


const aiService = require('./services/aiService');
app.post('/api/ai/generate-todos', cognitoAuth, async (req, res) => {
  try {
    const { videoTitle, videoId } = req.body;
    const todos = await aiService.generateTodoFromVideo(videoTitle);
    res.json({ success: true, todos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/ai/generate-quiz', cognitoAuth, async (req, res) => {
  try {
    const { videoTitle, videoId } = req.body;
    const quiz = await aiService.generateQuizFromVideo(videoTitle);
    res.json({ success: true, quiz });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/ai/analyze-content', cognitoAuth, async (req, res) => {
  try {
    const { videoTitle, videoId } = req.body;
    const analysis = await aiService.analyzeVideoContent(videoTitle);
    res.json({ success: true, analysis });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/ai/chat', cognitoAuth, async (req, res) => {
  try {
    const { message, context, teachingStyle } = req.body;
    let response;
    
    if (teachingStyle === 'david-malan') {
      response = await aiService.generateDavidMalanResponse(message, context);
    } else {
      response = await aiService.generateWithNovaPro(message, context);
    }
    
    res.json({ success: true, response, model: 'Amazon Nova Pro' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// S3 Upload endpoint

app.post('/api/videos/upload', simpleAdminAuth, require('multer')({ dest: 'uploads/' }).single('video'), async (req, res) => {
  try {
    const { courseName, title, chapter } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    // Generate S3 key
    const timestamp = Date.now();
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, '_');
    const s3Key = `videos/${courseName}/${timestamp}_${sanitizedTitle}.${file.originalname.split('.').pop()}`;
    
    // Upload to S3
    const fs = require('fs');
    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    
    const fileContent = fs.readFileSync(file.path);
    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME || 'default-bucket',
      Key: s3Key,
      Body: fileContent,
      ContentType: file.mimetype
    });
    
    await s3Client.send(uploadCommand);
    
    // Clean up temp file
    fs.unlinkSync(file.path);
    
    // Save to database
    const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
    const dynamoVideoService = require('./services/dynamoVideoService');
    
    const videoData = {
      _id: timestamp.toString(),
      title,
      sectionTitle: chapter || 'General',
      chapter: chapter || 'General', 
      videoUrl: s3Url,
      s3Key,
      order: 999,
      createdAt: new Date().toISOString(),
      watched: false
    };
    
    console.log('Saving video data:', videoData);
    const result = await dynamoVideoService.addVideoToCourse(courseName, videoData);
    console.log('Save result:', result);
    
    if (result) {
      res.json({ success: true, message: 'Video uploaded successfully', videoUrl: s3Url });
    } else {
      res.status(500).json({ success: false, error: 'Failed to save video to database' });
    }
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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
app.get('/admin/dashboard', sessionAuth, async (req, res) => {
  if (req.user?.email !== 'engineerfelex@gmail.com') {
    return res.redirect('/dashboard');
  }
  
  try {
    const dynamoVideoService = require('./services/dynamoVideoService');
    const courses = await dynamoVideoService.getAllCourses();
    const stats = {
      totalCourses: courses.length,
      totalVideos: courses.reduce((sum, course) => sum + (course.videos?.length || 0), 0),
      totalStudents: 1
    };
    res.render('admin-dashboard', { stats, courses: courses || [] });
  } catch (error) {
    console.error('Error loading admin dashboard:', error);
    res.render('admin-dashboard', { stats: { totalCourses: 0, totalVideos: 0, totalStudents: 0 }, courses: [] });
  }
});
app.get('/admin/course-manager', sessionAuth, async (req, res) => {
  if (req.user?.email !== 'engineerfelex@gmail.com') {
    return res.redirect('/dashboard');
  }
  
  try {
    const dynamoVideoService = require('./services/dynamoVideoService');
    const courses = await dynamoVideoService.getAllCourses();
    console.log('Admin courses loaded:', courses.length);
    res.render('admin-course-manager', { courses: courses || [] });
  } catch (error) {
    console.error('Error loading courses for admin:', error);
    res.render('admin-course-manager', { courses: [] });
  }
});

// Web Routes (protected by session)
app.use('/admin', sessionAuth, require('./routes/admin-courses'));
app.use('/courses', sessionAuth, require('./routes/courses'));
app.use('/videos', sessionAuth, require('./routes/videos'));

// Controllers
const webController = require('./controllers/webController');
app.get('/course/:courseName', sessionAuth, (req, res) => webController.renderCourse(req, res));
app.get('/course/:courseName/video/:videoId?', sessionAuth, (req, res) => webController.renderVideo(req, res));
app.get('/videos/:courseName/:videoId', sessionAuth, (req, res) => webController.renderVideo(req, res));

module.exports = app;