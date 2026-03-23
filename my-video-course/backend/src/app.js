require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');

const app = express();
const connectDB = require('./utils/mongodb');

// Connect to MongoDB Atlas
connectDB();app.use(cors());
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
app.use(express.static(path.join(__dirname, '../../frontend/public')));
app.use('/videos', express.static(path.join(__dirname, '../../frontend/public/videos')));
app.use('/css', express.static(path.join(__dirname, '../../frontend/public/css')));
app.use('/js', express.static(path.join(__dirname, '../../frontend/public/js')));

// Health check
app.get('/health', async (req, res) => {
  const dynamoVideoService = require('./services/dynamoVideoService');
  const dbStatus = await dynamoVideoService.healthCheck();
  
  // Check MongoDB Status
  const mongoose = require('mongoose');
  const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  
  res.json({ 
    status: 'healthy', 
    database: dbStatus,
    mongodb: mongoStatus,
    timestamp: new Date().toISOString() 
  });
});

// Admin Routes
app.use('/admin/login', require('./routes/admin-login'));
app.use('/admin/courses', require('./middleware/adminCognitoAuth'), require('./routes/admin-courses'));

// Public Routes (NO AUTH REQUIRED)
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.render('pages/login', { error: null }));
app.get('/signup', (req, res) => res.render('pages/signup', { error: null }));
app.get('/forgot-password', (req, res) => res.render('pages/forgot-password', { error: null }));
app.get('/reset-password', (req, res) => res.render('pages/reset-password', { error: null }));

// Admin auth endpoint (public)
app.post('/admin/auth', async (req, res) => {
  const { email, password } = req.body;
  
  if (email !== 'engineerfelex@gmail.com') {
    return res.json({ success: false, error: 'Admin access only' });
  }
  
  try {
    const cognitoService = require('./services/cognitoService');
    const result = await cognitoService.signIn(email, password);
    
    req.session.user = {
      email: 'engineerfelex@gmail.com',
      roles: ['admin', 'teacher', 'student'],
      currentRole: 'admin',
      isAdmin: true,
      isTeacher: true,
      token: result.accessToken
    };
    
    res.json({ 
      success: true, 
      message: 'Admin authenticated',
      redirect: '/admin/course-manager'
    });
  } catch (error) {
    res.json({ success: false, error: 'Invalid credentials' });
  }
});

// Public API Routes (NO AUTH REQUIRED)
app.use('/api/auth', require('./routes/api/auth'));
app.use('/api/sync', require('./routes/api/sync'));
app.use('/api/migrate', require('./routes/api/migrate'));
app.use('/api/dynamodb', require('./routes/api/dynamodb'));

// Gamification stats endpoint (requires auth)
app.get('/api/gamification/stats', async (req, res) => {
  try {
    const gamificationManager = require('./services/gamificationManager');
    const userId = req.user?.email || req.session?.user?.email;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const userData = await gamificationManager.getUserData(userId);
    res.json({ 
      success: true, 
      data: userData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Video streaming routes (NO AUTH REQUIRED for direct file access)
app.get('/videos/:courseName/file/:id', (req, res) => {
  const webController = require('./controllers/webController');
  webController.streamVideo(req, res);
});

// Public video API endpoints (NO AUTH REQUIRED)
app.get('/api/videos/localStorage', async (req, res) => {
  try {
    const dynamoVideoService = require('./services/dynamoVideoService');
    const courses = await dynamoVideoService.getAllCourses();
    
    const localStorageFormat = {};
    courses.forEach(course => {
      localStorageFormat[course.name] = {
        videos: course.videos || []
      };
    });
    
    res.json(localStorageFormat);
  } catch (error) {
    console.error('Error getting localStorage format:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/videos/stream-url', async (req, res) => {
  try {
    const { videoKey } = req.body;
    
    if (!S3Client || !GetObjectCommand) {
      return res.status(500).json({ success: false, error: 'AWS SDK not available' });
    }
    
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME || 'video-course-bucket-047ad47c',
      Key: videoKey
    });
    
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    
    res.json({ success: true, streamUrl: signedUrl });
  } catch (error) {
    console.error('Error generating stream URL:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/gamification/load', async (req, res) => {
  try {
    const gamificationManager = require('./services/gamificationManager');
    const userId = req.user?.email || req.session?.user?.email;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const userData = await gamificationManager.getUserData(userId);
    res.json({
      success: true,
      achievements: userData.achievements || [],
      userStats: userData.stats || {},
      streakData: { currentStreak: userData.streak || 0 }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/gamification/sync', async (req, res) => {
  try {
    const { achievements, userStats, streakData } = req.body;
    const userId = req.user?.email || req.session?.user?.email;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const gamificationManager = require('./services/gamificationManager');
    const updates = {
      achievements: achievements || [],
      stats: userStats || {},
      streak: streakData?.currentStreak || 0
    };

    await gamificationManager.updateUserData(userId, updates);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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
  res.status(403).json({ success: false, message: 'Admin or teacher access required' });
};

// Simple admin auth for S3 uploads
const simpleAdminAuth = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey === process.env.ADMIN_KEY || adminKey === 'admin123') {
    return next();
  }
  console.log('Auth failed, admin key:', adminKey);
  res.status(403).json({ success: false, message: 'Admin access required' });
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
// app.use('/api/videos/fix-numbering', adminAuth, require('./routes/api/videos-fix'));
// app.use('/api/videos-manage', teacherOrAdminAuth, require('./routes/api/videos-manage'));

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
// app.use('/api/admin', cognitoAuth, require('./routes/api/admin'));
app.use('/api/enterprise-upload', require('./routes/api/enterprise-upload'));

// Protected API Routes
app.use('/api/videos', cognitoAuth, require('./routes/api/videos'));
app.use('/api/video-proxy', cognitoAuth, require('./routes/api/video-proxy'));
app.use('/api/captions', require('./routes/api/captions'));
app.use('/api/learning', require('./routes/api/learning'));

// Gamification routes - stats endpoint public, others protected
const gamificationRouter = require('./routes/api/gamification');
app.get('/api/gamification/stats', gamificationRouter);
app.use('/api/gamification', cognitoAuth, gamificationRouter);
app.use('/api/gamification', cognitoAuth, require('./routes/api/gamification-missing'));
app.use('/api/videos', cognitoAuth, require('./routes/api/videos-missing'));

app.use('/api/quizzes', cognitoAuth, require('./routes/api/quizzes'));
app.use('/api/ai', cognitoAuth, require('./routes/api/ai'));
// app.use('/api/users', cognitoAuth, require('./routes/api/users'));
app.use('/api/enrollments', cognitoAuth, require('./routes/api/enrollments'));
app.use('/api/wishlist', cognitoAuth, require('./routes/api/wishlist'));
app.use('/api/teacher', cognitoAuth, require('./routes/api/teacher'));

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

app.get('/api/next-video', async (req, res) => {
  try {
    const { currentVideoId, courseName, direction } = req.query;
    const userId = req.user?.email || req.session?.user?.email;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const dynamoVideoService = require('./services/dynamoVideoService');
    const videos = await dynamoVideoService.getVideosForCourse(courseName, userId);
    
    console.log(`🔍 Navigation: ${direction} from ${currentVideoId} in ${courseName}`);
    console.log(`📹 Found ${videos.length} videos`);
    
    const currentIndex = videos.findIndex(v => v._id && v._id.toString() === currentVideoId);
    console.log(`📍 Current index: ${currentIndex}`);
    
    let targetVideo = null;
    
    if (direction === 'prev' && currentIndex > 0) {
      targetVideo = videos[currentIndex - 1];
    } else if (direction === 'next' && currentIndex < videos.length - 1) {
      targetVideo = videos[currentIndex + 1];
    }
    
    console.log(`🎯 Target video:`, targetVideo?._id, targetVideo?.title);
    
    if (targetVideo && targetVideo._id) {
      res.json(targetVideo);
    } else {
      console.log('❌ No valid target video found');
      res.status(404).json({ error: 'No video found' });
    }
  } catch (error) {
    console.error('Navigation error:', error);
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
    
    // Enrich context with SRT content if available
    let enrichedContext = { ...context };
    if (context?.videoId && context?.courseName) {
      try {
        const srtContent = await getSRTContent(context.courseName, context.videoId);
        if (srtContent) {
          enrichedContext.transcript = srtContent.slice(0, 3000); // Limit size
        }
      } catch (error) {
        console.log('No SRT content available for enrichment');
      }
    }
    
    // Check cache first
    const dynamoVideoService = require('./services/dynamoVideoService');
    const cachedResponse = await dynamoVideoService.getCachedAIResponse(message, enrichedContext);
    
    if (cachedResponse) {
      return res.json({ success: true, response: cachedResponse, model: 'Amazon Nova Pro (cached)' });
    }
    
    let response;
    if (teachingStyle === 'david-malan') {
      response = await aiService.generateDavidMalanResponse(message, enrichedContext);
    } else {
      // Default to David Malan style for better explanations
      response = await aiService.generateDavidMalanResponse(message, enrichedContext);
    }
    
    // Ensure response is a string
    const responseText = typeof response === 'string' ? response : String(response || 'I apologize, but I encountered an issue processing that request.');
    
    // Cache the response
    await dynamoVideoService.cacheAIResponse(message, enrichedContext, responseText);
    
    res.json({ success: true, response: responseText, model: 'Amazon Nova Pro' });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function getSRTContent(courseName, videoId) {
  const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
  const s3Client = new S3Client({ region: process.env.AWS_REGION });
  const Course = require('./models/Course');
  const mongoose = require('mongoose');

  let video = null;
  
  // Try MongoDB first
  try {
    const course = await Course.findOne({ 
      $or: [{ title: courseName }, { name: courseName }] 
    }).lean();
    
    if (course) {
      // Find lecture by ID or title
      for (const section of course.sections || []) {
        video = section.lectures?.find(l => 
          (l._id && l._id.toString() === videoId) || 
          (l.id === videoId) || 
          (l.title === videoId)
        );
        if (video) break;
      }
    }
  } catch (err) {
    console.log('MongoDB fetch failed for SRT, falling back to DynamoDB');
  }

  // Fallback to DynamoDB if not found
  if (!video) {
    const dynamoVideoService = require('./services/dynamoVideoService');
    const videos = await dynamoVideoService.getVideosForCourse(courseName);
    video = videos.find(v => v._id && v._id.toString() === videoId);
  }
  
  if (!video?.s3Key) return null;
  
  const videoFilename = video.s3Key.split('/').pop().replace('.mp4', '');
  const timestamps = ['1756578844', '1756579046', '1756575209', '1756585495'];
  
  for (const timestamp of timestamps) {
    try {
      const srtKey = `videos/${courseName}/${videoFilename}__${timestamp}.srt`;
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: srtKey
      }));
      
      const srtContent = await response.Body.transformToString();
      return srtContent
        .split('\n')
        .filter(line => !line.match(/^\d+$/) && !line.match(/\d{2}:\d{2}:\d{2}/) && line.trim())
        .join(' ');
    } catch (error) {
      continue;
    }
  }
  return null;
}

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
  console.log('Course manager accessed by:', req.user?.email);
  
  if (req.user?.email !== 'engineerfelex@gmail.com') {
    console.log('Access denied - not admin user');
    return res.redirect('/dashboard');
  }
  
  try {
    const Course = require('./models/Course'); // Use MongoDB model for the new ERD
    const courses = await Course.find({}).lean();
    console.log('Admin courses loaded from MongoDB:', courses.length);
    res.render('admin-course-manager', { courses: courses || [] });
  } catch (error) {
    console.error('Error loading courses from MongoDB for admin:', error);
    // Fallback if needed, or render empty
    res.render('admin-course-manager', { courses: [] });
  }
});

// ── SUPER ADMIN DASHBOARD ─────────────────────────────────────────────
const ADMIN_EMAIL = 'engineerfelex@gmail.com';

app.get('/admin/super', sessionAuth, async (req, res) => {
  if (req.user?.email !== ADMIN_EMAIL) return res.redirect('/dashboard');

  try {
    const User    = require('./models/User');
    const Course  = require('./models/Course');
    const Enrollment = require('./models/Enrollment');
    const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

    // ── Parallel data fetch ───────────────────────────────────────
    const [allUsers, allCourses, allEnrollments] = await Promise.all([
      User.find({}).lean(),
      Course.find({}).lean(),
      Enrollment.find({}).lean()
    ]);

    const students = allUsers.filter(u => u.role !== 'teacher' && u.role !== 'admin');
    const teachers = allUsers.filter(u => u.role === 'teacher' || u.email === ADMIN_EMAIL);

    // ── Enrollment counts per course ──────────────────────────────
    const enrollMap = {};
    allEnrollments.forEach(e => {
      const cid = e.course?.toString();
      if (cid) enrollMap[cid] = (enrollMap[cid] || 0) + 1;
    });

    const coursesWithStats = allCourses.map(c => ({
      ...c,
      enrollmentCount: enrollMap[c._id.toString()] || 0,
      lectureCount: (c.sections || []).reduce((sum, s) => sum + (s.lectures?.length || 0), 0)
    }));

    // ── S3 Storage per teacher ────────────────────────────────────
    let s3Storage = [];
    let totalS3Bytes = 0;
    try {
      const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
      const bucket = process.env.S3_BUCKET_NAME || 'video-course-bucket-047ad47c';

      const allObjects = [];
      let token;
      do {
        const cmd = new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token });
        const resp = await s3.send(cmd);
        (resp.Contents || []).forEach(o => allObjects.push(o));
        token = resp.NextContinuationToken;
      } while (token);

      totalS3Bytes = allObjects.reduce((s, o) => s + (o.Size || 0), 0);

      // Group by teacher slug from key prefix (videos/<teacherEmail>/...)
      const teacherMap = {};
      allObjects.forEach(obj => {
        const parts = obj.Key.split('/');
        const teacher = parts.length >= 2 ? parts[1] : 'unknown';
        teacherMap[teacher] = (teacherMap[teacher] || 0) + (obj.Size || 0);
      });
      s3Storage = Object.entries(teacherMap)
        .map(([name, bytes]) => ({ name, bytes, mb: (bytes / 1024 / 1024).toFixed(1) }))
        .sort((a, b) => b.bytes - a.bytes);
    } catch (s3Err) {
      console.warn('S3 audit skipped:', s3Err.message);
    }

    // ── Active sessions (last-seen within 30 min via session) ────
    // We show all users as "recently active" stub (real impl needs session store scan)
    const activeSessions = allUsers.filter(u => u.updatedAt && 
      (Date.now() - new Date(u.updatedAt).getTime()) < 30 * 60 * 1000
    );

    res.render('super-admin-dashboard', {
      user: req.user,
      stats: {
        totalStudents: students.length,
        totalTeachers: teachers.length,
        totalCourses: allCourses.length,
        totalS3GB: (totalS3Bytes / 1024 / 1024 / 1024).toFixed(2),
        totalS3Bytes,
        maxS3Bytes: Math.max(totalS3Bytes, 1)
      },
      allUsers,
      courses: coursesWithStats,
      teachers,
      s3Storage,
      activeSessions
    });
  } catch (err) {
    console.error('Super admin error:', err);
    res.status(500).render('error', { message: 'Super admin dashboard failed: ' + err.message });
  }
});

// ── Super admin API actions ───────────────────────────────────────────
app.post('/api/admin/users/:id/deactivate', sessionAuth, async (req, res) => {
  if (req.user?.email !== ADMIN_EMAIL) return res.status(403).json({ success: false });
  const User = require('./models/User');
  await User.findByIdAndUpdate(req.params.id, { isDeactivated: true });
  res.json({ success: true });
});

app.post('/api/admin/users/:id/reactivate', sessionAuth, async (req, res) => {
  if (req.user?.email !== ADMIN_EMAIL) return res.status(403).json({ success: false });
  const User = require('./models/User');
  await User.findByIdAndUpdate(req.params.id, { isDeactivated: false });
  res.json({ success: true });
});

app.delete('/api/admin/courses/:id', sessionAuth, async (req, res) => {
  if (req.user?.email !== ADMIN_EMAIL) return res.status(403).json({ success: false });
  const Course = require('./models/Course');
  await Course.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Course deleted' });
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