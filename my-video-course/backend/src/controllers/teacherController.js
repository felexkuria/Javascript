const dynamoVideoService = require('../services/dynamoVideoService');
const dynamodb = require('../utils/dynamodb');

const ADMIN_EMAIL = 'engineerfelex@gmail.com';

class TeacherController {
  async renderDashboard(req, res) {
    try {
      const user = req.user || req.session?.user;
      const userId = user?.id || user?.email || 'guest';
      
      // 1. Fetch courses from DynamoDB
      const allCourses = await dynamoVideoService.getAllCourses(userId);
      const instructorCourses = allCourses.filter(c => 
        c.instructorId === userId || 
        c.createdBy === userId || 
        c.instructorEmail === userId ||
        userId === ADMIN_EMAIL
      );
      
      // 2. Fetch enrollments from DynamoDB (Note: DynamoDB scans or global queries needed for instructor view)
      // For now, we'll use a simplified approach since DynamoDB doesn't support easy "all enrollments for my courses" without indexes
      // We'll mock student count or fetch if possible
      const totalStudents = instructorCourses.reduce((sum, c) => sum + (c.enrollments || 0), 0);
      
      // Map courses to a simpler format for the view
      const courseStats = instructorCourses.map(course => {
        return {
          id: course.name,
          title: course.title || course.name,
          isPublished: course.isPublished !== false,
          enrollments: course.enrollments || 0,
          lastUpdated: course.updatedAt
        };
      });

      res.render('teacher-dashboard', {
        user,
        totalCourses: instructorCourses.length,
        publishedCourses: instructorCourses.filter(c => c.isPublished !== false).length,
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
      
      const dynamoEnrollments = await dynamoVideoService.getUserEnrollments(userId);
      const allCourses = await dynamoVideoService.getAllCourses(userId);
      
      const studentCourses = dynamoEnrollments.map(enrol => {
        const course = allCourses.find(c => c.name === enrol.courseName);
        if (!course) return null;
        
        const totalLectures = course.videos?.length || 0;
        const watchedLectures = course.videos?.filter(v => v.watched).length || 0;
        const progressPercent = totalLectures > 0 ? Math.round((watchedLectures / totalLectures) * 100) : 0;
        
        return {
          id: course.name,
          name: course.name,
          instructor: course.instructor || 'David Malan',
          progress: progressPercent,
          totalVideos: totalLectures,
          watchedVideos: watchedLectures,
          videos: course.videos || []
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

      // Admin can open any course; teachers can only open their own
      const course = await dynamoVideoService.getCourseByTitle(id, userId);
      
      if (!course) {
        return res.status(404).render('error', { message: 'Course not found or access denied.' });
      }

      // Ensure sections are populated for the editor (fallback to flat videos if empty)
      if (!course.sections || course.sections.length === 0) {
        const videos = course.videos || [];
        const sectionMap = {};
        const sections = [];
        
        videos.forEach(v => {
          const sName = v.section || v.sectionTitle || 'Course Content';
          if (!sectionMap[sName]) {
            sectionMap[sName] = { _id: 'fallback-' + Date.now(), title: sName, lectures: [] };
            sections.push(sectionMap[sName]);
          }
          sectionMap[sName].lectures.push({
            ...v,
            _id: v.videoId || v._id,
            title: v.title
          });
        });
        course.sections = sections;
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
      
      const newCourse = {
        name: title,
        title,
        slug,
        category: category || 'General',
        description: description || '',
        instructor: user?.name || 'Instructor',
        instructorId: userId,
        isPublished: false,
        videos: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
 
      await dynamodb.saveCourse(newCourse);
      res.redirect(`/teacher/course-editor/${encodeURIComponent(newCourse.name)}`);
    } catch (error) {
      console.error('Error creating course:', error);
      res.status(500).render('error', { message: 'Error creating course: ' + error.message });
    }
  }

  async renderUploadCenter(req, res) {
    try {
      const user = req.user || req.session?.user;
      const userId = user?.id || user?.email || 'guest';
      
      const courses = await dynamoVideoService.getAllCourses(userId);
      const instructorCourses = courses.filter(c => c.instructorId === userId || c.createdBy === userId || userId === ADMIN_EMAIL);
      
      res.render('teacher-upload-center', { 
        user,
        courses 
      });
    } catch (error) {
      console.error('Error rendering upload center:', error);
      res.status(500).render('error', { message: 'Error loading upload center: ' + error.message });
    }
  }

  async deleteCourse(req, res) {
    try {
      const { id } = req.params;
      const courseService = require('../services/courseService');
      
      await courseService.deleteCourseData(id);
      
      res.json({ success: true, message: 'Course and all associated data deleted successfully' });
    } catch (error) {
      console.error('Error deleting course:', error);
      res.status(500).json({ success: false, message: 'Error deleting course: ' + error.message });
    }
  }
}

module.exports = new TeacherController();