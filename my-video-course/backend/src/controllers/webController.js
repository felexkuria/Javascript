const path = require('path');
const fs = require('fs');
const dynamoVideoService = require('../services/dynamoVideoService');
const dynamodb = require('../utils/dynamodb');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

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
      const userId = user?.email;
      
      if (!userId) {
        return res.status(401).redirect('/login');
      }

      // Check for teacher dashboard request
      const roles = user?.roles || [];
      const isAdmin = user?.isAdmin || roles.includes('admin') || user?.email === 'engineerfelex@gmail.com';
      const isTeacher = user?.isTeacher || roles.includes('teacher');
      const requestedTeacher = user?.currentRole === 'teacher' || (user?.currentRole === 'admin' && req.path === '/teacher/dashboard');
      
      if (requestedTeacher && (isAdmin || isTeacher)) {
        const teacherController = require('./teacherController');
        return teacherController.renderDashboard(req, res);
      }

      // Fetch data from DynamoDB
      const [courses, enrollments, certificates, gamificationData] = await Promise.all([
        dynamoVideoService.getAllCourses(userId),
        dynamoVideoService.getUserEnrollments(userId),
        dynamodb.getCertificates(userId),
        dynamoVideoService.getUserGamificationData(userId)
      ]);

      // Calculate stats
      const totalCourses = courses.length;
      const enrolledCourses = courses.filter(c => enrollments.some(e => e.courseName === (c.name || c.courseName)));
      const totalVideos = enrolledCourses.reduce((sum, c) => sum + (c.videos?.length || 0), 0);
      const watchedVideos = enrolledCourses.reduce((sum, c) => sum + (c.videos?.filter(v => v.watched).length || 0), 0);

      // Template selection - Correcting path logic to check root-relative frontend dir
      const frontendPath = path.join(__dirname, '../../../frontend/src/pages/dashboard.ejs');
      const dashboardTemplate = fs.existsSync(frontendPath) ? 'pages/dashboard' : 'dashboard';
      
      res.render(dashboardTemplate, {
        user: {
          ...(user || {}),
          isAdmin: user?.role === 'admin' || user?.email === 'engineerfelex@gmail.com'
        },
        courses: enrolledCourses,
        allCourses: courses,
        enrollments,
        stats: {
          totalCourses,
          totalVideos,
          watchedVideos,
          certificatesCount: certificates.length,
          watchedPercent: totalVideos > 0 ? Math.round((watchedVideos / totalVideos) * 100) : 0
        },
        gamificationData: gamificationData || {
          userStats: { totalPoints: 0, currentLevel: 1, experiencePoints: 0 },
          streakData: { currentStreak: 0 }
        }
      });
    } catch (err) {
      console.error('Dashboard Error:', err);
      res.status(500).render('error', { message: 'Failed to load dashboard: ' + err.message });
    }
  }

  async renderCourse(req, res) {
    try {
      const courseName = decodeURIComponent(req.params.courseName);
      const userId = req.user?.email || 'guest';
      
      const course = await dynamoVideoService.getCourseByTitle(courseName, userId);
      if (!course) {
        return res.status(404).render('error', { message: 'Course not found' });
      }

      const allVideos = course.videos || [];
      const totalVideos = allVideos.length;
      const watchedVideos = allVideos.filter(v => v.watched).length;
      const watchedPercent = totalVideos > 0 ? Math.round((watchedVideos / totalVideos) * 100) : 0;

      // Check Enrollment Status
      let isEnrolled = false;
      if (userId !== 'guest') {
        const enrollments = await dynamoVideoService.getUserEnrollments(userId);
        isEnrolled = enrollments.some(e => e.courseName === courseName);
      }

      // Group videos by section (Source of truth: course.sections if available)
      let sections = course.sections;
      
      if (!sections || sections.length === 0) {
        sections = [];
        const sectionMap = {};
        allVideos.forEach(v => {
          const sName = v.section || v.sectionTitle || 'Course Content';
          if (!sectionMap[sName]) {
            sectionMap[sName] = { title: sName, lectures: [] };
            sections.push(sectionMap[sName]);
          }
          sectionMap[sName].lectures.push({
            ...v,
            contentId: v.videoId || v._id,
            basename: v.videoUrl ? path.basename(v.videoUrl) : null
          });
        });
      }

      // Ensure all lectures in sections have contentId for template compatibility
      sections.forEach(s => {
        s.lectures = s.lectures || [];
        s.lectures.forEach(l => {
          if (!l.contentId) l.contentId = l.videoId || l._id;
        });
      });

      res.render('course', {
        course,
        courseName,
        courseId: courseName,
        videos: allVideos,
        sections,
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
      const courseName = decodeURIComponent(req.params.courseName).trim();

      const videoId = req.params.videoId || req.params.id;
      const userId = req.user?.email || 'guest';
      const autoplay = req.query.autoplay === 'true';

      const course = await dynamoVideoService.getCourseByTitle(courseName, userId);
      if (!course) {
        return res.status(404).render('error', { message: 'Course not found' });
      }

      const videos = course.videos || [];
      const video = videos.find(v => (v.videoId === videoId) || (v._id === videoId) || (v.title === videoId)) || videos[0];

      if (!video) {
        return res.status(404).render('error', { message: 'Video not found' });
      }

      // Group for sidebar (Source of truth: course.sections if available)
      let sections = course.sections;
      
      if (!sections || sections.length === 0) {
        sections = [];
        const sectionMap = {};
        videos.forEach(v => {
          const sName = v.section || v.sectionTitle || 'Course Content';
          if (!sectionMap[sName]) {
            sectionMap[sName] = { title: sName, lectures: [] };
            sections.push(sectionMap[sName]);
          }
          sectionMap[sName].lectures.push({
            ...v,
            contentId: v.videoId || v._id,
            id: v.videoId || v._id,
            title: v.title
          });
        });
      }

      // Ensure all lectures in sections have contentId for template compatibility
      sections.forEach(s => {
        s.lectures = s.lectures || [];
        s.lectures.forEach(l => {
          if (!l.contentId) l.contentId = l.videoId || l._id;
          if (!l.id) l.id = l.videoId || l._id;
        });
      });

      // Find next/prev
      const currentIndex = videos.findIndex(v => (v.videoId === video.videoId) || (v._id === video._id));
      const prevVideo = currentIndex > 0 ? videos[currentIndex - 1] : null;
      const nextVideo = currentIndex < videos.length - 1 ? videos[currentIndex + 1] : null;
      const isLastVideo = currentIndex === videos.length - 1;
      const isLastInChapter = nextVideo && (nextVideo.section !== video.section);

      // Handle S3 Signing
      let processedUrl = video.videoUrl || video.url;
      const isYouTube = !!(processedUrl && (processedUrl.includes('youtube.com') || processedUrl.includes('youtu.be') || video.type === 'youtube'));

      if (processedUrl && (processedUrl.includes('amazonaws.com') || video.s3Key) && !isYouTube) {
        try {
          const s3VideoService = require('../services/s3VideoService');
          const processed = await s3VideoService.processVideoUrl(video, 'student', courseName);
          processedUrl = processed.fullVideoUrl || processed.videoUrl;
        } catch (s3Err) {
          console.warn('S3 Signing failed:', s3Err.message);
        }
      }

      res.render('video', {
        course,
        courseName,
        video: {
          ...video,
          id: video.videoId || video._id,
          videoUrl: processedUrl
        },
        sections,
        prevVideo,
        nextVideo,
        isLastVideo,
        isLastInChapter,
        isYouTube,
        autoplay,
        user: req.user,
        aiEnabled: true,
        userId
      });
    } catch (err) {
      console.error('Error rendering video:', err);
      res.status(500).render('error', { message: 'Error loading video: ' + err.message });
    }

  }
  
  async renderCourses(req, res) {
    try {
      const user = req.user || req.session?.user;
      const userId = user?.email || 'guest';
      const courses = await dynamoVideoService.getAllCourses(userId);
      
      const normalizedCourses = courses.map(c => ({
        ...c,
        videoCount: c.videos?.length || 0,
        sections: [...new Set((c.videos || []).map(v => v.section || v.sectionTitle || 'Content'))]
      }));

      res.render('courses', { 
        user, 
        courses: normalizedCourses,
        activePage: 'courses'
      });
    } catch (err) {
      console.error('Error rendering courses:', err);
      res.status(500).render('error', { message: 'Failed to load courses catalog' });
    }
  }

  async renderCertificates(req, res) {
    try {
      const userId = req.user?.email;
      if (!userId) return res.redirect('/login');
      
      const certificates = await dynamodb.getCertificates(userId);
      res.render('certificates', { certificates });
    } catch (err) {
      res.status(500).render('error', { message: 'Failed to load certificates' });
    }
  }

  async serveVideoLegacy(req, res) {
    try {
      const courseName = decodeURIComponent(req.params.courseName);
      const id = req.params.id;
      res.redirect(`/course/${encodeURIComponent(courseName)}/video/${id}`);
    } catch (err) {
      console.error('Error serving video:', err);
      res.status(500).send('Error serving video');
    }
  }

  async renderProfile(req, res) {
    try {
      const userId = req.user?.email || 'guest';
      const gamificationData = await dynamoVideoService.getUserGamificationData(userId);
      res.render('profile', { user: req.user, gamificationData });
    } catch (err) {
      res.render('profile', { user: req.user, gamificationData: null });
    }
  }

  async serveCaptions(req, res) {
    try {
      const courseName = decodeURIComponent(req.params.courseName);
      const id = req.params.id;
      const video = await dynamoVideoService.getVideoById(courseName, id);
      if (!video || !video.captionsUrl) return res.status(404).send('No captions');
      
      const captionPath = path.join(__dirname, '../../../frontend/public/videos', video.captionsUrl);
      if (fs.existsSync(captionPath)) {
        res.setHeader('Content-Type', 'text/vtt');
        res.sendFile(captionPath);
      } else {
        res.status(404).send('File not found');
      }
    } catch (err) {
      res.status(500).send('Error');
    }
  }
}

module.exports = new WebController();