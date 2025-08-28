const dynamoVideoService = require('../services/dynamoVideoService');

class TeacherController {
  async renderDashboard(req, res) {
    try {
      // Get all courses and student data
      const courses = await dynamoVideoService.getAllCourses();
      
      // Calculate teacher dashboard stats
      let totalVideos = 0;
      let totalStudents = 0;
      let totalWatchTime = 0;
      const courseStats = [];

      for (const course of courses) {
        const videos = course.videos || [];
        const watchedVideos = videos.filter(v => v.watched).length;
        
        totalVideos += videos.length;
        
        courseStats.push({
          name: course.name,
          totalVideos: videos.length,
          watchedVideos: watchedVideos,
          completionRate: videos.length > 0 ? Math.round((watchedVideos / videos.length) * 100) : 0
        });
      }

      // Get recent activity (last 10 watched videos)
      const recentActivity = [];
      for (const course of courses) {
        const videos = course.videos || [];
        const watchedVideos = videos
          .filter(v => v.watched && v.watchedAt)
          .sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt))
          .slice(0, 5);
        
        watchedVideos.forEach(video => {
          recentActivity.push({
            courseName: course.name,
            videoTitle: video.title,
            watchedAt: video.watchedAt,
            student: 'Student' // In real app, get from user data
          });
        });
      }

      // Sort recent activity by date
      recentActivity.sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt));

      res.render('teacher-dashboard', {
        user: req.user,
        totalCourses: courses.length,
        totalVideos,
        totalStudents: 1, // Placeholder
        courseStats,
        recentActivity: recentActivity.slice(0, 10),
        courses
      });
    } catch (error) {
      console.error('Error rendering teacher dashboard:', error);
      res.status(500).render('error', { message: 'Error loading teacher dashboard' });
    }
  }

  async renderStudentDashboard(req, res) {
    try {
      // Get user's gamification data
      const userId = req.user?.email || 'default_user';
      const gamificationData = await dynamoVideoService.getUserGamificationData(userId);
      
      // Get all courses for student view
      const courses = await dynamoVideoService.getAllCourses();
      
      // Calculate student progress
      let totalVideos = 0;
      let watchedVideos = 0;
      
      courses.forEach(course => {
        const videos = course.videos || [];
        totalVideos += videos.length;
        watchedVideos += videos.filter(v => v.watched).length;
      });

      const progressPercent = totalVideos > 0 ? Math.round((watchedVideos / totalVideos) * 100) : 0;

      res.render('dashboard', {
        user: req.user,
        courses,
        offlineMode: false,
        gamificationData: gamificationData || {
          userStats: {
            totalPoints: 0,
            currentLevel: 1,
            videosWatched: {},
            coursesCompleted: 0
          }
        },
        progressPercent,
        totalVideos,
        watchedVideos
      });
    } catch (error) {
      console.error('Error rendering student dashboard:', error);
      res.status(500).render('error', { message: 'Error loading dashboard' });
    }
  }
}

module.exports = new TeacherController();