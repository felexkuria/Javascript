const dynamoVideoService = require('../services/dynamoVideoService');
const Course = require('../models/Course');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');

const ADMIN_EMAIL = 'engineerfelex@gmail.com';

class TeacherController {
  async renderDashboard(req, res) {
    try {
      const user = req.user || req.session?.user;
      const userId = user?.id || user?.email || 'guest';
      
      // 1. Fetch courses from MongoDB (ONLY courses for this instructor)
      const courses = await Course.find({ instructorId: userId }).lean();
      
      // 2. Fetch all enrollments to calculate student stats
      const enrollments = await Enrollment.find({}).lean();
      
      // Calculate instructor stats
      const totalCourses = courses.length;
      const publishedCourses = courses.filter(c => c.isPublished).length;
      const totalStudents = new Set(enrollments.map(e => e.userId)).size;
      
      // Map courses to a simpler format for the view
      const courseStats = courses.map(course => {
        const courseEnrollments = enrollments.filter(e => e.courseId && e.courseId.toString() === course._id.toString());
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
        recentActivity: []
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
      
      const enrollments = await Enrollment.find({ userId: userId })
        .populate('courseId')
        .lean();
      
      const allCourses = await Course.find({ isPublished: true }).lean();
      
      const studentCourses = enrollments.map(enrol => {
        const course = enrol.courseId;
        if (!course) return null;
        
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

      const gamificationData = await dynamoVideoService.getUserGamificationData(userId);

      res.render('dashboard', {
        user,
        courses: studentCourses,
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
      const userId = user?.id || user?.email || 'guest';
      const isAdmin = userId === ADMIN_EMAIL || user?.isAdmin || user?.role === 'admin' || user?.email === ADMIN_EMAIL;

      // Robust ObjectId casting for lookup
      const mongoose = require('mongoose');
      const objectId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;

      // Admin can open any course; teachers can only open their own
      const query = isAdmin ? { _id: objectId } : { _id: objectId, instructorId: userId };
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
  
  async renderNewCourseForm(req, res) {
    const user = req.user || req.session?.user;
    res.render('teacher-course-new', { user });
  }

  async createNewCourse(req, res) {
    try {
      const user = req.user || req.session?.user;
      const { title, category, description } = req.body;
      const userId = user?.id || user?.email || 'guest';
      
      const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      
      const newCourse = new Course({
        title,
        slug,
        category: category || 'General',
        description: description || '',
        instructor: user?.name || 'Instructor',
        instructorId: userId,
        isPublished: false,
        sections: []
      });

      await newCourse.save();
      res.redirect(`/teacher/course-editor/${newCourse._id}`);
    } catch (error) {
      console.error('Error creating course:', error);
      res.status(500).render('error', { message: 'Error creating course: ' + error.message });
    }
  }
}

module.exports = new TeacherController();