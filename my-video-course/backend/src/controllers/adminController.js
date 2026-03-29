const dynamodb = require('../utils/dynamodb');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const courseService = require('../services/courseService');
const dynamoVideoService = require('../services/dynamoVideoService');

const ADMIN_EMAIL = 'engineerfelex@gmail.com';

class AdminController {
  async renderSuperDashboard(req, res) {
    if (req.user?.email !== ADMIN_EMAIL) return res.redirect('/dashboard');

    try {
      const [allUsers, allCourses] = await Promise.all([
        dynamodb.getAllUsers(),
        dynamoVideoService.getAllCourses('admin')
      ]);

      const students = allUsers.filter(u => u.role !== 'teacher' && u.role !== 'admin');
      const teachers = allUsers.filter(u => u.role === 'teacher' || u.email === ADMIN_EMAIL);

      const coursesWithStats = allCourses.map(c => ({
        ...c,
        enrollmentCount: c.enrollments || 0,
        lectureCount: (c.videos || []).length
      }));

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
  }

  async deactivateUser(req, res) {
    if (req.user?.email !== ADMIN_EMAIL) return res.status(403).json({ success: false });
    const user = await dynamodb.getUser(req.params.id);
    if (user) {
      user.isDeactivated = true;
      await dynamodb.saveUser(user);
    }
    res.json({ success: true });
  }

  async reactivateUser(req, res) {
    if (req.user?.email !== ADMIN_EMAIL) return res.status(403).json({ success: false });
    const user = await dynamodb.getUser(req.params.id);
    if (user) {
      user.isDeactivated = false;
      await dynamodb.saveUser(user);
    }
    res.json({ success: true });
  }

  async deleteCourse(req, res) {
    if (req.user?.email !== ADMIN_EMAIL) return res.status(403).json({ success: false });
    try {
      await courseService.deleteCourseData(req.params.id);
      res.json({ success: true, message: 'Course deleted' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async renderCourseManager(req, res) {
    if (req.user?.email !== ADMIN_EMAIL) return res.redirect('/dashboard');
    try {
      const courses = await dynamoVideoService.getAllCourses('admin');
      res.render('admin-course-manager', { courses: courses || [] });
    } catch (error) {
      console.error('Error loading course manager:', error);
      res.render('admin-course-manager', { courses: [] });
    }
  }

  async renderTeacherRequests(req, res) {
    if (req.user?.email !== ADMIN_EMAIL) return res.redirect('/dashboard');
    try {
      // Fetch teacher requests from DynamoDB (if available) or render empty
      const requests = []; // TODO: Implement dynamodb.getTeacherRequests() if needed
      res.render('admin-teacher-requests', { requests: requests || [], user: req.user });
    } catch (error) {
      console.error('Error loading teacher requests:', error);
      res.render('admin-teacher-requests', { requests: [], user: req.user });
    }
  }

  async renderAnalytics(req, res) {
    if (req.user?.email !== ADMIN_EMAIL) return res.redirect('/dashboard');
    res.render('admin-analytics', { user: req.user });
  }
}


module.exports = new AdminController();
