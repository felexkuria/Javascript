const dynamoVideoService = require('../services/dynamoVideoService');
const path = require('path');
const fs = require('fs');
const Course = require('../models/Course');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');

class WebController {
  async redirectToDashboard(req, res) {
    try {
      res.redirect('/dashboard');
    } catch (err) {
      console.error('Error redirecting to dashboard:', err);
      res.status(500).send('Server Error');
    }
  }

  async renderDashboard(req, res) {
    try {
      const user = req.user || req.session?.user;
      console.log('Dashboard - User roles:', user?.roles, 'Current role:', user?.currentRole);
      
      // Check if user specifically requested teacher role and has teacher permissions
      const requestedTeacher = user?.currentRole === 'teacher';
      const hasTeacherRole = user?.roles?.includes('teacher') || user?.isTeacher;
      
      if (requestedTeacher && hasTeacherRole) {
        console.log('✅ Rendering teacher dashboard');
        const teacherController = require('./teacherController');
        return teacherController.renderDashboard(req, res);
      }
      
      console.log('✅ Rendering student dashboard');
      const userId = user?.email;
      if (!userId) {
        return res.status(401).redirect('/login');
      }
      console.log('🔍 User ID for Dashboard:', userId);

      // 1. Fetch from DynamoDB (Legacy/Hybrid)
      let courses = await dynamoVideoService.getAllCourses(userId);
      console.log(`🔍 Found ${courses?.length} DynamoDB courses`);
      
      // 2. Fetch from MongoDB Enrollments (New Architecture)
      try {
        const mongoose = require('mongoose');
        console.log(`📡 MongoDB State for Dashboard: ${mongoose.connection.readyState} (1=Connected)`);
        console.log(`📡 Database Name: ${mongoose.connection.db?.databaseName}`);

        // Broad find for debugging if specific find fails
        const allEnrollments = await Enrollment.find({}).lean();
        console.log(`🔍 DEBUG: Total enrollments in DB: ${allEnrollments.length}`);
        
        const enrollments = await Enrollment.find({ 
          userId: { $regex: new RegExp(`^${userId}$`, 'i') } 
        }).populate('courseId').lean();

        console.log(`🔍 Found ${enrollments.length} MongoDB enrollments for: ${userId}`);
        
        const enrolledCourses = enrollments
          .filter(e => e.courseId) // Ensure course hasn't been deleted
          .map(e => {
            const allLectures = (e.courseId.sections || []).flatMap(s => s.lectures || []);
            return {
              _id: e.courseId._id,
              name: e.courseId.title, // Dashboard uses .name for URL
              title: e.courseId.title,
              instructor: 'Engineer Felex',
              category: e.courseId.category || 'Core',
              description: e.courseId.description,
              videos: allLectures, // Mapping the lectures to videos array
              videoCount: allLectures.length,
              watchedVideos: 0,
              completionPercentage: 0,
              isMongo: true
            };
          });

        console.log(`🔍 Processed ${enrolledCourses.length} Enrolled Courses from MongoDB`);

        // Merge keeping DynamoDB for now but preferring MongoDB titles
        const seenTitles = new Set(enrolledCourses.map(c => c.title.toLowerCase()));
        courses = [
          ...enrolledCourses,
          ...courses.filter(c => !seenTitles.has(c.name.toLowerCase()))
        ];
        console.log(`🔍 Total merged courses for dashboard: ${courses.length}`);
      } catch (mongoErr) {
        console.error('❌ MongoDB Enrollment fetch failed:', mongoErr.message);
      }

      const gamificationData = await dynamoVideoService.getUserGamificationData(userId);
      const usingDynamoDB = dynamoVideoService.isDynamoAvailable();

      res.render('dashboard', { 
        courses, 
        offlineMode: !usingDynamoDB,
        user: {
          ...user,
          isAdmin: user.role === 'admin' || user.email === 'engineerfelex@gmail.com'
        },
        gamificationData: gamificationData || {
          userStats: { totalPoints: 0, currentLevel: 1, experiencePoints: 0 },
          streakData: { currentStreak: 0 }
        }
      });
    } catch (err) {
      console.error('Error fetching course data:', err);
      res.status(500).send('Internal Server Error');
    }
  }

  async renderCourse(req, res) {
    try {
      const courseName = decodeURIComponent(req.params.courseName);
      const userId = req.user?.email || 'guest';
      console.log(`Rendering course: ${courseName} for user: ${userId}`);
      
      // 1. Try to fetch course from MongoDB (New Architecture)
      const slug = courseName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const mongoCourse = await Course.findOne({ 
        $or: [{ slug: slug }, { title: courseName }, { name: courseName }] 
      }).lean();

      let sections = [];
      let totalVideosCount = 0;
      let courseId = null;

      if (mongoCourse) {
        courseId = mongoCourse._id;
        sections = mongoCourse.sections || [];
        totalVideosCount = sections.reduce((sum, s) => sum + (s.lectures?.length || 0), 0);
      }

      // 2. Fallback or data enrichment via DynamoDB
      let videos = await dynamoVideoService.getVideosForCourse(courseName, userId);
      
      if (!Array.isArray(videos)) {
        videos = [];
      }

      const totalVideos = mongoCourse ? totalVideosCount : videos.length;
      const watchedVideos = videos.filter(v => v.watched).length;
      const watchedPercent = totalVideos > 0 ? Math.round((watchedVideos / totalVideos) * 100) : 0;

      // 3. Check Enrollment Status
      let isEnrolled = false;
      if (userId !== 'guest') {
        const enrollment = await Enrollment.findOne({ userId, courseId: mongoCourse?._id });
        isEnrolled = !!enrollment;
      }

      res.render('course', {
        courseName,
        courseId, // Crucial for Enrollment
        videos: videos.map(v => ({...v, basename: v.videoUrl ? path.basename(v.videoUrl) : null})),
        sections, // Crucial for Curriculum UI
        totalVideos,
        watchedVideos,
        watchedPercent,
        aiEnabled: true,
        isAdmin: userId === 'engineerfelex@gmail.com',
        isEnrolled
      });
    } catch (err) {
      console.error('Error fetching course data:', err);
      res.status(500).render('error', { message: 'Error loading course' });
    }
  }

  async renderVideo(req, res) {
    try {
      const courseName = decodeURIComponent(req.params.courseName);
      const videoId = req.params.videoId || req.params.id;
      const userId = req.user?.email || 'guest';
      const autoplay = req.query.autoplay === 'true';

      // 1. Try to fetch course from MongoDB (New Architecture)
      const slug = courseName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const mongoCourse = await Course.findOne({ $or: [{ slug: slug }, { title: courseName }] });

      let sections = [];
      let video = null;
      let videos = []; // Still needed for some legacy logic

      if (mongoCourse) {
        sections = mongoCourse.sections;
        // Flatten lectures to find the specific one and calculate progress
        const allLectures = sections.flatMap(s => s.lectures);
        video = allLectures.find(l => l.contentId === videoId) || allLectures[0];
        videos = allLectures.map(l => ({ ...l, _id: l.contentId }));
      } else {
        // 2. Fallback to DynamoDB (Legacy)
        videos = await dynamoVideoService.getVideosForCourse(courseName, userId);
        if (!videos || videos.length === 0) {
          return res.status(404).render('error', { message: 'Course not found' });
        }
        // Group legacy flat videos into a single section for the new UI
        sections = [{ title: 'Course Content', lectures: videos.map(v => ({
          title: v.title,
          contentId: v._id || v.videoId,
          s3Key: v.s3Key,
          duration: v.duration || 0,
          type: 'video'
        })) }];
        video = videos.find(v => (v._id && v._id.toString() === videoId) || (v.videoId === videoId)) || videos[0];
      }

      // Process video URL (S3 signing, etc.)
      const s3VideoService = require('../services/s3VideoService');
      const userRole = req.user?.isTeacher ? 'teacher' : 'student';
      const processedVideo = await s3VideoService.processVideoUrl(video, userRole, courseName);

      // Progress calculations
      const gamificationData = await dynamoVideoService.getUserGamificationData(userId);
      const userWatchedVideos = gamificationData?.userStats?.videosWatched || {};
      const totalVideos = videos.length;
      const watchedVideos = videos.filter(v => userWatchedVideos[v._id] || userWatchedVideos[v.contentId]).length;
      const watchedPercent = totalVideos > 0 ? Math.round((watchedVideos / totalVideos) * 100) : 0;

      // Calculate sequence markers for the player
      const allLectures = sections.flatMap(s => s.lectures);
      const videoIndex = allLectures.findIndex(l => l.contentId === videoId || l._id?.toString() === videoId);
      const isLastVideo = videoIndex === allLectures.length - 1;

      // Find if it's last in its specific section
      let isLastInChapter = false;
      for (const section of sections) {
        const lastInSec = section.lectures[section.lectures.length - 1];
        if (lastInSec && (lastInSec.contentId === videoId || lastInSec._id?.toString() === videoId)) {
          isLastInChapter = true;
          break;
        }
      }

      res.render('video', {
        video: processedVideo,
        courseName,
        sections,
        watchedVideos,
        totalVideos,
        watchedPercent,
        autoplay,
        user: req.user,
        aiEnabled: true,
        isYouTube: processedVideo.isYouTube || false,
        isLastVideo,
        isLastInChapter
      });
    } catch (err) {
      console.error('Error rendering video page:', err);
      res.status(500).render('error', { message: 'Server error: ' + err.message });
    }
  }

  async renderVideoById(req, res) {
    try {
      const courseName = decodeURIComponent(req.params.courseName);
      const id = req.params.id;

      // Skip MongoDB ObjectId validation for DynamoDB IDs
      res.redirect(`/course/${encodeURIComponent(courseName)}/video/${id}`);
    } catch (err) {
      console.error('Error serving video:', err);
      res.status(500).send('Internal Server Error');
    }
  }

  async redirectToCourse(req, res) {
    try {
      const courseName = decodeURIComponent(req.params.courseName);
      res.redirect(`/course/${encodeURIComponent(courseName)}`);
    } catch (err) {
      console.error('Error redirecting to course page:', err);
      res.status(500).render('error', { message: 'Server error' });
    }
  }

  async redirectToVideo(req, res) {
    try {
      const videoUrl = req.params.videoUrl;
      const courseName = req.query.courseName;

      if (!videoUrl || !courseName) {
        return res.status(400).send('Missing video URL or course name');
      }

      const urlParts = videoUrl.split('/');
      const videoId = urlParts[urlParts.length - 1];

      res.redirect(`/videos/${courseName}/${videoId}`);
    } catch (err) {
      console.error('Error redirecting to video:', err);
      res.status(500).send('Internal Server Error');
    }
  }

  async renderProfile(req, res) {
    try {
      const userId = req.user?.email || 'guest';
      const gamificationData = await dynamoVideoService.getUserGamificationData(userId);
      
      res.render('profile', {
        user: req.user,
        gamificationData: gamificationData || {
          userStats: {
            totalPoints: 0,
            currentLevel: 1,
            videosWatched: {},
            coursesCompleted: 0
          }
        }
      });
    } catch (error) {
      console.error('Error rendering profile:', error);
      res.render('profile', { user: req.user, gamificationData: null });
    }
  }



  async renderSettings(req, res) {
    res.render('settings');
  }

  async renderChatbot(req, res) {
    res.render('chatbot');
  }

  async renderTestQuiz(req, res) {
    res.sendFile(path.join(__dirname, '../../../test-quiz.html'));
  }

  async servePdf(req, res) {
    const pdfPath = req.params[0];
    const fullPath = path.join(__dirname, '../../../frontend/public/videos', pdfPath);

    fs.access(fullPath, fs.constants.F_OK, (err) => {
      if (err) {
        console.error('PDF not found:', fullPath);
        return res.status(404).send('PDF not found');
      }
      res.sendFile(fullPath);
    });
  }

  async serveSubtitles(req, res) {
    try {
      const courseName = decodeURIComponent(req.params.courseName);
      const videoTitle = decodeURIComponent(req.params.videoTitle);

      const courseDir = path.join(__dirname, '../../../frontend/public/videos', courseName);
      let srtPath = null;

      const findSrt = (dir) => {
        if (!fs.existsSync(dir)) return null;
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          if (fs.statSync(filePath).isDirectory()) {
            const result = findSrt(filePath);
            if (result) return result;
          } else if (file === `${videoTitle}.srt`) {
            return filePath;
          }
        }
        return null;
      };

      srtPath = findSrt(courseDir);

      if (srtPath && fs.existsSync(srtPath)) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.sendFile(srtPath);
      } else {
        res.status(404).send('Subtitle file not found');
      }
    } catch (error) {
      console.error('Error serving subtitle:', error);
      res.status(500).send('Error serving subtitle');
    }
  }

  async serveCaptions(req, res) {
    try {
      const courseName = decodeURIComponent(req.params.courseName);
      const id = req.params.id;

      if (!id) {
        return res.status(400).send('Video ID is required');
      }

      const video = await dynamoVideoService.getVideoById(courseName, id);
      if (!video || !video.captionsUrl) {
        return res.status(404).send('No captions available');
      }

      const captionPath = path.join(__dirname, '../../../frontend/public/videos', video.captionsUrl);
      if (!fs.existsSync(captionPath)) {
        return res.status(404).send('Caption file not found');
      }

      const ext = path.extname(captionPath).toLowerCase();
      res.setHeader('Content-Type', 'text/vtt');

      if (ext === '.vtt') {
        res.sendFile(captionPath);
      } else if (ext === '.srt') {
        const captionConverter = require('../utils/captionConverter');
        fs.readFile(captionPath, 'utf8', (err, data) => {
          if (err) {
            return res.status(500).send('Error reading caption file');
          }
          const vttContent = captionConverter.srtToVtt(data);
          res.send(vttContent);
        });
      } else {
        res.status(400).send('Unsupported caption format');
      }
    } catch (err) {
      console.error('Error serving captions:', err);
      res.status(500).send('Internal Server Error');
    }
  }

  async downloadSrt(req, res) {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../../../frontend/public/whisper', filename);

    if (fs.existsSync(filePath)) {
      res.download(filePath, filename);
    } else {
      res.status(404).send('SRT file not found');
    }
  }

  async renderAdminCourses(req, res) {
    try {
      res.render('admin-courses');
    } catch (error) {
      console.error('Error rendering admin courses:', error);
      res.status(500).send('Internal Server Error');
    }
  }

  async streamVideo(req, res) {
    try {
      const courseName = decodeURIComponent(req.params.courseName);
      const id = req.params.id;

      const video = await dynamoVideoService.getVideoById(courseName, id);
      if (!video) {
        return res.status(404).send('Video not found');
      }

      // Handle S3 URLs - redirect to S3
      if (video.videoUrl && (video.videoUrl.startsWith('https://') || video.videoUrl.includes('amazonaws.com'))) {
        return res.redirect(video.videoUrl);
      }

      // Handle local files
      const videoPath = path.join(__dirname, '../../../frontend/public/videos', video.videoUrl);
      if (!fs.existsSync(videoPath)) {
        return res.status(404).send('Video file not found');
      }

      res.sendFile(videoPath);
    } catch (err) {
      console.error('Error streaming video:', err);
      res.status(500).send('Internal Server Error');
    }
  }
}

module.exports = new WebController();