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
      const courseName = decodeURIComponent(req.params.courseName).trim();
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

      // SOTA Smart Curriculum Engine
      const sections = await dynamoVideoService.getStructuredCurriculum(course, userId);
      
      // Batch Sign S3 Assets for Sidebar
      const s3VideoService = require('../services/s3VideoService');
      const signedSections = await Promise.all(sections.map(async (section) => ({
        ...section,
        lectures: await s3VideoService.processVideoList(section.lectures)
      })));

      res.render('course', {
        course,
        courseName,
        courseId: courseName,
        videos: allVideos,
        sections: signedSections,
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

      const rawVideoId = req.params.videoId;
      // 🔧 FIX: Safely normalize videoId — never null when comparisons need .toString()
      const videoId = (!rawVideoId || rawVideoId === 'undefined') ? null : rawVideoId.toString();
      const userId = req.user?.email || 'guest';
      const autoplay = req.query.autoplay === 'true';

      const course = await dynamoVideoService.getCourseByTitle(courseName, userId);
      if (!course) {
        return res.status(404).render('error', { message: 'Course not found' });
      }

      // Fetch user gamification status
      const gamificationData = await dynamoVideoService.getUserGamificationData(userId);

      // ── Video Resolution Strategy ────────────────────────────────────────────
      // course.videos[] uses _id (from DynamoDB course record, matches sidebar URLs)
      // getVideosForCourse() returns a standalone-table with videoId (different IDs)
      // We must match against course.videos first, then use the standalone table for S3 URLs.
      const courseVideos = course.videos || [];
      const standaloneVideos = await dynamoVideoService.getVideosForCourse(courseName, userId);

      // 🔧 FIX: Look up by _id in course.videos first (this is what sidebar links use)
      let video = null;
      if (videoId) {
        // 1. Primary: match in course.videos by _id or videoId
        const courseVideo = courseVideos.find(v =>
          (v._id      && v._id.toString()     === videoId) ||
          (v.videoId  && v.videoId.toString() === videoId) ||
          (v.id       && v.id.toString()       === videoId) ||
          (v.title    === videoId)
        );

        // 2. Standalone Metadata: always try to fetch full data from the standalone videos table
        const standaloneVideo = (standaloneVideos || []).find(v =>
          (v.videoId && v.videoId.toString() === videoId) ||
          (v._id     && v._id.toString()     === videoId) ||
          (v.title   === (courseVideo ? courseVideo.title : videoId))
        );

        // 3. Metadata Enrichment: merge full S3 data into the course reference
        if (courseVideo || standaloneVideo) {
          video = {
            ...(courseVideo || {}),
            ...(standaloneVideo || {}),
            // Ensure we keep the _id used by the course
            _id: videoId || (courseVideo ? courseVideo._id : (standaloneVideo ? standaloneVideo._id : null))
          };
        }
      }

      // 3. Default: first video in course
      if (!video) {
        video = courseVideos[0] || standaloneVideos[0];
      }

      if (!video) {
        return res.status(404).render('error', {
          message: `Video "${videoId}" not found in curriculum for course "${courseName}"`,
          details: 'The media asset reference is missing or its course mapping is invalid.'
        });
      }

      // ── Curriculum structure for sidebar ───────────────────────────────────
      const allVideos = courseVideos.length > 0 ? courseVideos : standaloneVideos;


      const sections = await dynamoVideoService.getStructuredCurriculum(course, userId);
      
      // Batch Sign S3 Assets for Sidebar
      const s3VideoService = require('../services/s3VideoService');
      const signedSections = await Promise.all(sections.map(async (section) => ({
        ...section,
        lectures: await s3VideoService.processVideoList(section.lectures)
      })));

      const currentIndex = allVideos.findIndex(v => (v._id && v._id === video._id) || (v.videoId && v.videoId === video.videoId));
      const prevVideo = currentIndex > 0 ? allVideos[currentIndex - 1] : null;
      const nextVideo = currentIndex < allVideos.length - 1 ? allVideos[currentIndex + 1] : null;
      const isLastVideo = currentIndex === allVideos.length - 1;
      const isLastInChapter = nextVideo && (nextVideo.section !== video.section);


      // SOTA Secure Media Delivery (Universal S3 Signing)
      const signedVideo = await s3VideoService.processVideoUrl(video, 'student', courseName);
      const isYouTube = !!(signedVideo.isYouTube || (signedVideo.videoUrl && (signedVideo.videoUrl.includes('youtube.com') || signedVideo.videoUrl.includes('youtu.be'))));

      res.render('video', {
        course,
        courseName,
        video: {
          ...signedVideo,
          id: signedVideo.videoId || signedVideo._id,
          videoUrl: signedVideo.fullVideoUrl || signedVideo.videoUrl
        },
        courseTitle: course.title,
        sections: signedSections,
        prevVideo,
        nextVideo,
        isLastVideo,
        isLastInChapter,
        isYouTube,
        autoplay,
        user: req.user,
        aiEnabled: true,
        userId,
        totalVideos: allVideos.length,
        watchedVideos: allVideos.filter(v => v.watched).length,
        gamificationData: (typeof gamificationData !== 'undefined' && gamificationData) ? gamificationData : {
          userStats: { totalPoints: 0, currentLevel: 1, experiencePoints: 0 },
          streakData: { currentStreak: 0 }
        }
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
      const courseName = decodeURIComponent(req.params.courseName).trim();
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
      const courseName = decodeURIComponent(req.params.courseName).trim();
      const id = req.params.id;
      const video = await dynamoVideoService.getVideoById(courseName, id);
      
      if (!video || !video.captionsUrl) {
          return res.status(404).send('No captions found for this video');
      }
      
      const s3VideoService = require('../services/s3VideoService');
      const bucketName = process.env.S3_BUCKET_NAME || 'video-course-app-video-bucket-prod-6m5k2til';
      
      // Construct the full S3 URL for signing
      let s3Url = video.captionsUrl;
      const bucketUrlPrefix = `https://${bucketName}.s3.amazonaws.com/`;
      
      if (!s3Url.startsWith('http')) {
        s3Url = bucketUrlPrefix + s3Url;
      }
      
      console.log(`📡 Signing Caption: ${s3Url}`);
      const signedUrl = await s3VideoService.generateSignedUrl(s3Url, 3600);
      res.redirect(signedUrl);
    } catch (err) {
      console.error('Error serving captions:', err);
      res.status(500).send('Error generating signed caption access');
    }
  }

  async servePdf(req, res) {
    try {
      // Capture the wildcard path from /pdf/*
      const pdfPath = req.params[0];
      if (!pdfPath) return res.status(404).send('PDF path missing');

      const s3VideoService = require('../services/s3VideoService');
      const bucketName = process.env.S3_BUCKET_NAME || 'video-course-app-video-bucket-prod-6m5k2til';
      
      // Construct the full S3 URL to be signed
      const s3Url = `https://${bucketName}.s3.amazonaws.com/${pdfPath}`;
      
      const signedUrl = await s3VideoService.generateSignedUrl(s3Url, 3600);
      res.redirect(signedUrl);
    } catch (err) {
      console.error('Error serving PDF:', err);
      res.status(500).send('Error generating access token for PDF');
    }
  }

  async downloadSrt(req, res) {
    try {
      const { filename } = req.params;
      const s3VideoService = require('../services/s3VideoService');
      const bucketName = process.env.S3_BUCKET_NAME || 'video-course-app-video-bucket-prod-6m5k2til';
      const s3Url = `https://${bucketName}.s3.amazonaws.com/captions/${filename}`;
      const signedUrl = await s3VideoService.generateSignedUrl(s3Url, 3600);
      res.redirect(signedUrl);
    } catch (err) {
      res.status(500).send('Error');
    }
  }

  async serveSubtitles(req, res) {
    try {
      const { courseName, videoTitle } = req.params;
      const s3VideoService = require('../services/s3VideoService');
      const bucketName = process.env.S3_BUCKET_NAME || 'video-course-app-video-bucket-prod-6m5k2til';
      const s3Key = `courses/${courseName}/captions/${videoTitle}.vtt`;
      const s3Url = `https://${bucketName}.s3.amazonaws.com/${s3Key}`;
      const signedUrl = await s3VideoService.generateSignedUrl(s3Url, 3600);
      res.redirect(signedUrl);
    } catch (err) {
      res.status(404).send('Not Found');
    }
  }

  async streamVideo(req, res) {
    try {
      const { courseName, id } = req.params;
      const video = await dynamoVideoService.getVideoById(courseName, id);
      if (!video || !video.videoUrl) return res.status(404).send('Video not found');
      
      const s3VideoService = require('../services/s3VideoService');
      const signedData = await s3VideoService.processVideoUrl(video);
      res.redirect(signedData.fullVideoUrl || video.videoUrl);
    } catch (err) {
      res.status(500).send('Error streaming video');
    }
  }
}

module.exports = new WebController();