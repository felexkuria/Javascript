const dynamoVideoService = require('../services/dynamoVideoService');
const Course = require('../models/Course');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');

class TeacherController {
  async renderDashboard(req, res) {
    try {
      const user = req.user || req.session?.user;
      const userId = user?.email || 'guest';
      
      // 1. Fetch courses from MongoDB (ONLY courses for this instructor)
      const courses = await Course.find({ instructorId: userId }).lean();
      
      // 2. Fetch all enrollments to calculate student stats
      const enrollments = await Enrollment.find({}).lean();
      
      // Calculate instructor stats
      const totalCourses = courses.length;
      const publishedCourses = courses.filter(c => c.isPublished).length;
      const totalStudents = new Set(enrollments.map(e => e.user)).size;
      
      // Map courses to a simpler format for the view
      const courseStats = courses.map(course => {
        const courseEnrollments = enrollments.filter(e => e.course.toString() === course._id.toString());
        return {
          id: course._id,
          title: course.title,
          isPublished: course.isPublished,
          enrollments: courseEnrollments.length,
          lastUpdated: course.updatedAt
        };
      });

      res.render('teacher-dashboard', {
        user,
        totalCourses,
        publishedCourses,
        totalStudents,
        courses: courseStats,
        recentActivity: [] // Optional: placeholder for now
      });
    } catch (error) {
      console.error('Error rendering teacher dashboard:', error);
      res.status(500).render('error', { message: 'Error loading teacher dashboard: ' + error.message });
    }
  }

  async renderStudentDashboard(req, res) {
    try {
      const user = req.user || req.session?.user;
      const userId = user?.email || 'default_user';
      
      // 1. Fetch user enrollments from MongoDB
      const enrollments = await Enrollment.find({ user: userId })
        .populate('course')
        .lean();
      
      // 2. Fetch all available courses (for discovery)
      const allCourses = await Course.find({ isPublished: true }).lean();
      
      // 3. Map enrollments to a format the dashboard expects
      const studentCourses = enrollments.map(enrol => {
        const course = enrol.course;
        if (!course) return null;
        
        // Calculate progress (lectures completed vs total)
        const totalLectures = course.sections?.reduce((sum, s) => sum + (s.lectures?.length || 0), 0) || 0;
        const watchedLectures = enrol.progress?.watchedLectures?.length || 0;
        const progressPercent = totalLectures > 0 ? Math.round((watchedLectures / totalLectures) * 100) : 0;
        
        return {
          id: course._id,
          name: course.title,
          instructor: course.instructor || 'David Malan',
          progress: progressPercent,
          totalVideos: totalLectures,
          watchedVideos: watchedLectures,
          videos: course.sections?.flatMap(s => s.lectures) || []
        };
      }).filter(c => c !== null);

      // 4. Get gamification data (fallback to placeholder if not in MongoDB yet)
      const gamificationData = await dynamoVideoService.getUserGamificationData(userId);

      res.render('dashboard', {
        user,
        courses: studentCourses, // Only enrolled courses for dashboard
        allCourses,
        gamificationData: gamificationData || {
          userStats: { totalPoints: 0, currentLevel: 1 },
          streakData: { currentStreak: 0 }
        }
      });
    } catch (error) {
      console.error('Error rendering student dashboard:', error);
      res.status(500).render('error', { message: 'Error loading dashboard: ' + error.message });
    }
  }

  async renderCourseEditor(req, res) {
    try {
      const { id } = req.params;
      const user = req.user || req.session?.user;
      const userId = user?.email || 'guest';
      const isAdmin = userId === 'engineerfelex@gmail.com' || user?.isAdmin || user?.role === 'admin';

      // Admin can open any course; teachers can only open their own
      const query = isAdmin ? { _id: id } : { _id: id, instructorId: userId };
      const course = await Course.findOne(query).lean();
      
      if (!course) {
        return res.status(404).render('error', { message: 'Course not found or access denied.' });
      }

      res.render('teacher-course-editor', {
        user,
        course,
        activeTab: req.query.tab || 'curriculum'
      });
    } catch (error) {
      console.error('Error rendering course editor:', error);
      res.status(500).render('error', { message: 'Error loading course editor: ' + error.message });
    }
  }

      res.status(500).render('error', { message: 'Error loading course editor: ' + error.message });
    }
  }
}

module.exports = new TeacherController();