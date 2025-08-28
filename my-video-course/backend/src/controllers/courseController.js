const dynamoVideoService = require('../services/dynamoVideoService');
const videoProcessingService = require('../services/videoProcessingService');
const mongoose = require('mongoose');
const multer = require('multer');

// Configure multer for video uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 1000 * 1024 * 1024 }, // 1GB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files allowed'));
    }
  }
});

class CourseController {
  // Get all courses with analytics
  async getAllCourses(req, res) {
    try {
      const userId = req.user?.email || 'default_user';
      const courses = await dynamoVideoService.getAllCourses(userId);
      
      // Convert to API format
      const formattedCourses = courses.map(course => {
        const videos = course.videos || [];
        return {
          _id: course.name.replace(/[^a-zA-Z0-9]/g, ''),
          name: course.name,
          title: course.name.replace(/[\[\]]/g, '').replace(/TutsNode\.com - /g, ''),
          subtitle: `${videos.length} lessons available`,
          description: `Complete course with ${videos.length} video lessons`,
          category: course.name.includes('AWS') ? 'Cloud Computing' : 
                   course.name.includes('DevOps') ? 'DevOps' : 
                   course.name.includes('DaVinci') ? 'Video Editing' : 
                   course.name.includes('Terraform') ? 'Infrastructure' : 'Programming',
          level: 'intermediate',
          price: 0,
          status: 'published',
          enrollments: Math.floor(Math.random() * 1000),
          totalLectures: videos.length,
          totalDuration: videos.length * 600,
          rating: 4.5,
          createdBy: 'admin',
          createdAt: new Date(),
          updatedAt: new Date(),
          videos: videos
        };
      });
      
      res.json({
        success: true,
        data: formattedCourses
      });
      
    } catch (error) {
      console.error('Error getting courses:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get courses',
        error: error.message
      });
    }
  }

  // Get course by name
  async getCourseByName(req, res) {
    try {
      const { name } = req.params;
      const userId = req.user?.email || 'default_user';
      const courseName = decodeURIComponent(name);
      const videos = await dynamoVideoService.getVideosForCourse(courseName, userId);
      
      if (!videos || videos.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Course not found'
        });
      }

      const course = {
        name: courseName,
        title: courseName.replace(/[\[\]]/g, '').replace(/TutsNode\.com - /g, ''),
        videos: videos,
        totalLectures: videos.length,
        watchedVideos: videos.filter(v => v.watched).length
      };

      res.json({
        success: true,
        data: course
      });
    } catch (error) {
      console.error('Error getting course:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get course',
        error: error.message
      });
    }
  }

  // Create new course
  async createCourse(req, res) {
    try {
      const courseData = {
        name: req.body.name || req.body.title,
        title: req.body.title,
        description: req.body.description,
        category: req.body.category,
        createdBy: req.user?.email || 'admin',
        slug: req.body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        createdAt: new Date().toISOString()
      };

      // Save to DynamoDB
      const success = await dynamodb.saveCourse(courseData);
      
      if (!success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to save course to database'
        });
      }

      res.status(201).json({
        success: true,
        data: courseData,
        message: 'Course created successfully'
      });
    } catch (error) {
      console.error('Error creating course:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create course',
        error: error.message
      });
    }
  }

  // Update course
  async updateCourse(req, res) {
    try {
      const { id } = req.params;
      const updateData = {
        ...req.body,
        updatedAt: new Date()
      };

      if (mongoose.connection.readyState === 1) {
        const collection = mongoose.connection.collection('courses');
        const result = await collection.updateOne(
          { _id: new mongoose.Types.ObjectId(id) },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: 'Course not found'
          });
        }
      }

      res.json({
        success: true,
        message: 'Course updated successfully'
      });
    } catch (error) {
      console.error('Error updating course:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update course',
        error: error.message
      });
    }
  }

  // Upload video to course
  async uploadVideo(req, res) {
    try {
      const { courseName, title } = req.body;
      const videoFile = req.file;
      
      if (!videoFile) {
        return res.status(400).json({
          success: false,
          message: 'No video file provided'
        });
      }
      
      if (!courseName || !title) {
        return res.status(400).json({
          success: false,
          message: 'Course name and title are required'
        });
      }
      
      // Process video (compress, upload to S3, generate captions, AI content)
      const processedVideo = await videoProcessingService.processVideo(
        videoFile, 
        courseName, 
        title
      );
      
      res.json({
        success: true,
        data: processedVideo,
        message: 'Video uploaded and processed successfully'
      });
    } catch (error) {
      console.error('Error uploading video:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload video',
        error: error.message
      });
    }
  }
  
  // Get analytics data
  async getAnalytics(req, res) {
    try {
      const { timeRange = '30d' } = req.query;
      const days = parseInt(timeRange.replace('d', ''));
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // Enrollment trends
      const enrollmentTrends = await Analytics.aggregate([
        {
          $match: {
            type: 'enrollment',
            timestamp: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);
      
      // Course performance
      const coursePerformance = await Analytics.aggregate([
        {
          $match: {
            type: { $in: ['enrollment', 'video_watch', 'quiz_completion'] },
            timestamp: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$courseId',
            enrollments: { $sum: { $cond: [{ $eq: ['$type', 'enrollment'] }, 1, 0] } },
            videoWatches: { $sum: { $cond: [{ $eq: ['$type', 'video_watch'] }, 1, 0] } },
            quizCompletions: { $sum: { $cond: [{ $eq: ['$type', 'quiz_completion'] }, 1, 0] } }
          }
        }
      ]);
      
      // Recent activity
      const recentActivity = await Analytics.find({
        timestamp: { $gte: startDate }
      })
      .populate('courseId', 'title')
      .sort({ timestamp: -1 })
      .limit(20);
      
      res.json({
        success: true,
        data: {
          enrollmentTrends,
          coursePerformance,
          recentActivity
        }
      });
    } catch (error) {
      console.error('Error getting analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get analytics',
        error: error.message
      });
    }
  }
  
  // Delete course
  async deleteCourse(req, res) {
    try {
      const { id } = req.params;
      
      const course = await Course.findByIdAndDelete(id);
      if (!course) {
        return res.status(404).json({
          success: false,
          message: 'Course not found'
        });
      }

      res.json({
        success: true,
        message: 'Course deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting course:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete course',
        error: error.message
      });
    }
  }
}

const controller = new CourseController();
controller.upload = upload;

module.exports = controller;