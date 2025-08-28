const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const Enrollment = require('../../models/Enrollment');

/**
 * POST /api/migrate/localStorage
 * Receive localStorage data from frontend and migrate to MongoDB
 */
router.post('/localStorage', async (req, res) => {
  try {
    const { courses, userProgress, gamification, metadata } = req.body;
    const targetEmail = 'engineerfelex@gmail.com'; // Default user
    
    console.log('📥 Received localStorage migration request');
    
    // Transform course data
    const transformedCourses = {};
    Object.entries(courses || {}).forEach(([courseName, videos]) => {
      transformedCourses[courseName] = {
        courseId: courseName,
        videos: videos.map(video => ({
          videoId: video._id,
          title: video.title,
          watched: video.watched || false,
          watchedAt: video.watchedAt || null,
          duration: video.duration || 0
        })),
        completedLectures: videos
          .filter(video => video.watched)
          .map(video => ({
            lectureId: video._id,
            completedAt: new Date(video.watchedAt || Date.now())
          }))
      };
      
      // Calculate progress
      const totalVideos = videos.length;
      const watchedVideos = transformedCourses[courseName].completedLectures.length;
      transformedCourses[courseName].progress = totalVideos > 0 ? 
        Math.round((watchedVideos / totalVideos) * 100) : 0;
    });
    
    // Find or create user
    let user = await User.findOne({ email: targetEmail });
    if (!user) {
      user = new User({
        userId: targetEmail,
        name: 'Felix Engineer',
        email: targetEmail,
        roles: ['student'],
        gamification: {
          achievements: [],
          streakData: {
            currentStreak: 0,
            longestStreak: 0,
            lastActiveDate: null,
            streakDates: []
          },
          userStats: {
            totalPoints: 0,
            videosWatched: new Map(),
            coursesCompleted: 0,
            keyboardShortcutsUsed: 0,
            currentLevel: 1,
            experiencePoints: 0
          }
        }
      });
    }
    
    // Merge gamification data
    if (gamification && Object.keys(gamification).length > 0) {
      const gamData = Object.values(gamification)[0]; // Get first gamification object
      if (gamData) {
        user.gamification = {
          achievements: gamData.achievements || user.gamification.achievements,
          streakData: gamData.streakData || user.gamification.streakData,
          userStats: {
            ...user.gamification.userStats,
            ...(gamData.userStats || {}),
            videosWatched: new Map(Object.entries(gamData.userStats?.videosWatched || {}))
          }
        };
      }
    }
    
    await user.save();
    
    // Process enrollments
    const enrollmentResults = [];
    for (const [courseName, courseData] of Object.entries(transformedCourses)) {
      let enrollment = await Enrollment.findOne({ 
        userId: user.userId, 
        courseId: courseData.courseId 
      });
      
      if (!enrollment) {
        enrollment = new Enrollment({
          userId: user.userId,
          courseId: courseData.courseId,
          progress: courseData.progress,
          completedLectures: courseData.completedLectures,
          status: courseData.progress === 100 ? 'completed' : 'active'
        });
      } else {
        // Merge without duplicates
        const existingIds = new Set(enrollment.completedLectures.map(l => l.lectureId));
        const newLectures = courseData.completedLectures.filter(l => !existingIds.has(l.lectureId));
        
        enrollment.completedLectures.push(...newLectures);
        enrollment.progress = Math.max(enrollment.progress, courseData.progress);
        enrollment.lastAccessedAt = new Date();
      }
      
      await enrollment.save();
      enrollmentResults.push({
        courseId: courseData.courseId,
        progress: enrollment.progress,
        completedLectures: enrollment.completedLectures.length
      });
    }
    
    res.json({
      success: true,
      message: 'localStorage data migrated successfully',
      data: {
        user: {
          email: user.email,
          totalPoints: user.gamification?.userStats?.totalPoints || 0,
          currentLevel: user.gamification?.userStats?.currentLevel || 1
        },
        enrollments: enrollmentResults,
        migrationMetadata: metadata
      }
    });
    
  } catch (error) {
    console.error('❌ Migration API error:', error);
    res.status(500).json({
      success: false,
      message: 'Migration failed',
      error: error.message
    });
  }
});

/**
 * GET /api/migrate/status
 * Check migration status for a user
 */
router.get('/status/:email?', async (req, res) => {
  try {
    const email = req.params.email || 'engineerfelex@gmail.com';
    
    const user = await User.findOne({ email });
    const enrollments = await Enrollment.find({ userId: email });
    
    if (!user) {
      return res.json({
        success: true,
        migrated: false,
        message: 'User not found in MongoDB'
      });
    }
    
    res.json({
      success: true,
      migrated: true,
      data: {
        user: {
          email: user.email,
          name: user.name,
          totalPoints: user.gamification?.userStats?.totalPoints || 0,
          videosWatched: user.gamification?.userStats?.videosWatched?.size || 0
        },
        enrollments: enrollments.map(e => ({
          courseId: e.courseId,
          progress: e.progress,
          completedLectures: e.completedLectures.length,
          status: e.status
        }))
      }
    });
    
  } catch (error) {
    console.error('❌ Status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Status check failed',
      error: error.message
    });
  }
});

module.exports = router;