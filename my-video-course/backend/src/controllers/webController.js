const videoService = require('../services/videoService');
const dynamoVideoService = require('../services/dynamoVideoService');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

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
      const userId = user?.email || 'guest';
      console.log('🔍 User ID:', userId);
      const courses = await dynamoVideoService.getAllCourses(userId);
      const gamificationData = await dynamoVideoService.getUserGamificationData(userId);
      console.log('🔍 Gamification Data:', {
        totalPoints: gamificationData?.userStats?.totalPoints,
        currentLevel: gamificationData?.userStats?.currentLevel,
        currentStreak: gamificationData?.streakData?.currentStreak
      });
      const usingDynamoDB = dynamoVideoService.isDynamoAvailable();

      res.render('dashboard', { 
        courses, 
        offlineMode: !usingDynamoDB,
        user: user,
        gamificationData: gamificationData || {
          userStats: {
            totalPoints: 0,
            currentLevel: 1,
            experiencePoints: 0
          },
          streakData: {
            currentStreak: 0
          }
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
      
      // Use DynamoDB service with user personalization
      let videos = await dynamoVideoService.getVideosForCourse(courseName, userId);
      console.log(`Found ${videos ? videos.length : 0} videos for course`);

      if (!Array.isArray(videos)) {
        videos = [];
      }

      console.log(`Videos already deduplicated and sorted: ${videos.length}`);
      // DynamoDB service already handles deduplication and sorting

      if (videos.length === 0) {
        return res.render('course', {
          courseName,
          videos: [],
          pdfs: [],
          totalVideos: 0,
          watchedVideos: 0,
          watchedPercent: 0,
          aiEnabled: true
        });
      }

      const processedVideos = videos.map(video => ({
        ...video,
        basename: video.videoUrl ? path.basename(video.videoUrl) : null,
        watched: video.watched || false
      }));

      const totalVideos = videos.length;
      const watchedVideos = videos.filter(v => v.watched).length;
      const watchedPercent = totalVideos > 0 ? Math.round((watchedVideos / totalVideos) * 100) : 0;

      res.render('course', {
        courseName,
        videos: processedVideos,
        pdfs: [],
        totalVideos,
        watchedVideos,
        watchedPercent,
        aiEnabled: true
      });
    } catch (err) {
      console.error('Error fetching course data:', err);
      res.status(500).render('error', { message: 'Error loading course' });
    }
  }

  async renderVideo(req, res) {
    try {
      const courseName = decodeURIComponent(req.params.courseName);
      console.log('Route params:', req.params);
      console.log('URL:', req.url);
      const videoId = req.params.videoId || req.params.id;
      console.log('Extracted videoId:', videoId);
      const userId = req.user?.email || 'guest';
      const autoplay = req.query.autoplay === 'true';

      // Use DynamoDB service with user personalization
      let videos = await dynamoVideoService.getVideosForCourse(courseName, userId);

      if (!videos || videos.length === 0) {
        return res.status(404).render('error', { message: 'Course not found or has no videos' });
      }
      
      // Remove duplicates by _id
      const uniqueVideos = [];
      const seenIds = new Set();
      
      for (const video of videos) {
        if (video && video._id && !seenIds.has(video._id.toString())) {
          seenIds.add(video._id.toString());
          uniqueVideos.push(video);
        }
      }
      
      videos = uniqueVideos;

      videos = videos.sort((a, b) => {
        // Use sortOrder/lessonNumber if available
        if (a.sortOrder && b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        if (a.lessonNumber && b.lessonNumber) {
          return a.lessonNumber - b.lessonNumber;
        }
        
        // Fallback to title-based sorting
        const aMatch = a.title?.match(/(\d+)/);
        const bMatch = b.title?.match(/(\d+)/);
        const aNum = aMatch ? parseInt(aMatch[1]) : 0;
        const bNum = bMatch ? parseInt(bMatch[1]) : 0;
        
        if (aNum !== bNum) {
          return aNum - bNum;
        }
        
        return a.title.localeCompare(b.title);
      });

      videos.forEach((video, index) => {
        video.lessonNumber = index + 1;
        video.displayTitle = video.title || 'Untitled Video';
      });

      const videosByChapter = {};
      videos.forEach(video => {
        const chapter = video.chapter || 'Uncategorized';
        if (!videosByChapter[chapter]) {
          videosByChapter[chapter] = [];
        }
        videosByChapter[chapter].push(video);
      });

      Object.keys(videosByChapter).forEach(chapter => {
        videosByChapter[chapter].sort((a, b) => a.lessonNumber - b.lessonNumber);
      });

      const chapters = Object.keys(videosByChapter).sort();

      let video;
      let videoIndex = 0;

      if (videoId) {
        console.log(`Looking for video ID: ${videoId}`);
        console.log(`Available videos: ${videos.length}`);
        if (videos.length > 0) {
          console.log(`Sample video IDs: ${videos.slice(0,3).map(v => v._id || v.videoId).join(', ')}`);
        }
        
        video = videos.find(v => 
          (v._id && v._id.toString() === videoId) || 
          (v.videoId && v.videoId.toString() === videoId)
        );
        videoIndex = videos.findIndex(v => 
          (v._id && v._id.toString() === videoId) || 
          (v.videoId && v.videoId.toString() === videoId)
        );

        if (!video) {
          console.log(`Video not found: ${videoId}`);
          return res.status(404).render('error', { message: 'Video not found', courseName });
        }
        console.log(`Found video: ${video.title}`);
      } else {
        video = videos[0];
      }

      const s3VideoService = require('../services/s3VideoService');
      const userRole = req.user?.isTeacher ? 'teacher' : 'student';
      video = s3VideoService.processVideoUrl(video, userRole, courseName);

      const watchedVideos = videos.filter(v => v.watched).length;
      const totalVideos = videos.length;
      const watchedPercent = Math.round((watchedVideos / totalVideos) * 100);

      const isFirstVideo = videoIndex === 0;
      const isLastVideo = videoIndex === videos.length - 1;

      const prevVideoId = video.prevVideoId || (!isFirstVideo ? videos[videoIndex - 1]._id.toString() : null);
      const nextVideoId = video.nextVideoId || (!isLastVideo ? videos[videoIndex + 1]._id.toString() : null);

      let isLastInChapter = false;
      if (!isLastVideo && video.chapter) {
        const nextVideo = videos[videoIndex + 1];
        isLastInChapter = !nextVideo.chapter || nextVideo.chapter !== video.chapter;
      } else if (isLastVideo && video.chapter) {
        isLastInChapter = true;
      }

      const pdfs = [];

      res.render('video', {
        video,
        courseName,
        videos,
        watchedVideos,
        totalVideos,
        watchedPercent,
        isFirstVideo,
        isLastVideo,
        isLastInChapter,
        prevVideoId,
        nextVideoId,
        pdfs,
        autoplay,
        chapters,
        videosByChapter,
        aiEnabled: true,
        isYouTube: video.isYouTube || false
      });
    } catch (err) {
      console.error('Error rendering video page:', err);
      res.status(500).render('error', { message: 'Server error' });
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

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).send('Invalid video ID');
      }

      const video = await videoService.getVideoById(courseName, id);
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

      const video = await videoService.getVideoById(courseName, id);
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