const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Import models
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');

const TARGET_USER_EMAIL = 'engineerfelex@gmail.com';

/**
 * 1. MongoDB Connection
 */
async function connectMongoDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

/**
 * 2. Extract localStorage data (simulated from JSON files)
 */
async function extractLocalStorageData() {
  try {
    const localStoragePath = path.join(__dirname, '../../../data/localStorage.json');
    const gamificationPath = path.join(__dirname, '../../../data/gamification.json');
    
    const localStorageData = JSON.parse(await fs.readFile(localStoragePath, 'utf8'));
    const gamificationData = JSON.parse(await fs.readFile(gamificationPath, 'utf8'));
    
    console.log('✅ Extracted localStorage data');
    return { localStorageData, gamificationData };
  } catch (error) {
    console.error('❌ Failed to extract localStorage data:', error.message);
    throw error;
  }
}

/**
 * 3. Transform localStorage data to MongoDB format
 */
function transformLocalStorageData(localStorageData, gamificationData) {
  const courses = {};
  const videoProgress = {};
  
  // Process video data by course
  Object.entries(localStorageData).forEach(([courseName, videos]) => {
    if (!courses[courseName]) {
      courses[courseName] = {
        courseId: courseName,
        videos: [],
        completedLectures: [],
        progress: 0
      };
    }
    
    videos.forEach(video => {
      courses[courseName].videos.push({
        videoId: video._id,
        title: video.title,
        watched: video.watched || false,
        watchedAt: video.watchedAt || null,
        duration: video.duration || 0,
        metadata: video.metadata || {}
      });
      
      if (video.watched) {
        courses[courseName].completedLectures.push({
          lectureId: video._id,
          completedAt: new Date(video.watchedAt || Date.now())
        });
      }
      
      videoProgress[video._id] = video.watched || false;
    });
    
    // Calculate progress
    const totalVideos = courses[courseName].videos.length;
    const watchedVideos = courses[courseName].completedLectures.length;
    courses[courseName].progress = totalVideos > 0 ? Math.round((watchedVideos / totalVideos) * 100) : 0;
  });
  
  // Process gamification data
  const defaultUserData = gamificationData.default_user || {};
  const userGamification = {
    achievements: defaultUserData.achievements || [],
    streakData: defaultUserData.streakData || {
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      streakDates: []
    },
    userStats: {
      totalPoints: defaultUserData.userStats?.totalPoints || 0,
      videosWatched: new Map(Object.entries(videoProgress)),
      coursesCompleted: defaultUserData.userStats?.coursesCompleted || 0,
      keyboardShortcutsUsed: defaultUserData.userStats?.keyboardShortcutsUsed || 0,
      currentLevel: defaultUserData.userStats?.currentLevel || 1,
      experiencePoints: defaultUserData.userStats?.experiencePoints || 0
    }
  };
  
  console.log('✅ Transformed localStorage data');
  return { courses, userGamification };
}

/**
 * 4. Merge data into MongoDB
 */
async function mergeUserData(courses, userGamification) {
  try {
    // Find or create user
    let user = await User.findOne({ email: TARGET_USER_EMAIL });
    
    if (!user) {
      console.log(`📝 Creating new user: ${TARGET_USER_EMAIL}`);
      user = new User({
        userId: TARGET_USER_EMAIL,
        name: 'Felix Engineer',
        email: TARGET_USER_EMAIL,
        roles: ['student'],
        gamification: userGamification,
        todoProgress: {}
      });
    } else {
      console.log(`📝 Updating existing user: ${TARGET_USER_EMAIL}`);
      // Merge gamification data
      user.gamification = {
        ...user.gamification,
        ...userGamification,
        userStats: {
          ...user.gamification?.userStats,
          ...userGamification.userStats
        }
      };
    }
    
    await user.save();
    console.log('✅ User data merged successfully');
    
    // Process enrollments
    const enrollmentResults = [];
    
    for (const [courseName, courseData] of Object.entries(courses)) {
      let enrollment = await Enrollment.findOne({ 
        userId: user.userId, 
        courseId: courseData.courseId 
      });
      
      if (!enrollment) {
        console.log(`📝 Creating enrollment for course: ${courseName}`);
        enrollment = new Enrollment({
          userId: user.userId,
          courseId: courseData.courseId,
          progress: courseData.progress,
          completedLectures: courseData.completedLectures,
          status: courseData.progress === 100 ? 'completed' : 'active'
        });
      } else {
        console.log(`📝 Updating enrollment for course: ${courseName}`);
        // Merge completed lectures without duplicates
        const existingLectureIds = new Set(enrollment.completedLectures.map(l => l.lectureId));
        const newLectures = courseData.completedLectures.filter(l => !existingLectureIds.has(l.lectureId));
        
        enrollment.completedLectures.push(...newLectures);
        enrollment.progress = Math.max(enrollment.progress, courseData.progress);
        enrollment.lastAccessedAt = new Date();
        
        if (enrollment.progress === 100 && enrollment.status !== 'completed') {
          enrollment.status = 'completed';
        }
      }
      
      await enrollment.save();
      enrollmentResults.push({
        courseId: courseData.courseId,
        progress: enrollment.progress,
        completedLectures: enrollment.completedLectures.length,
        status: enrollment.status
      });
    }
    
    console.log('✅ Enrollment data merged successfully');
    return { user, enrollments: enrollmentResults };
  } catch (error) {
    console.error('❌ Failed to merge user data:', error.message);
    throw error;
  }
}

/**
 * 5. Verification and logging
 */
async function verifyMigration() {
  try {
    const user = await User.findOne({ email: TARGET_USER_EMAIL });
    const enrollments = await Enrollment.find({ userId: user.userId });
    
    console.log('\n📊 MIGRATION VERIFICATION:');
    console.log('========================');
    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`🎮 Gamification:`);
    console.log(`   - Total Points: ${user.gamification?.userStats?.totalPoints || 0}`);
    console.log(`   - Current Level: ${user.gamification?.userStats?.currentLevel || 1}`);
    console.log(`   - Videos Watched: ${user.gamification?.userStats?.videosWatched?.size || 0}`);
    console.log(`   - Current Streak: ${user.gamification?.streakData?.currentStreak || 0}`);
    
    console.log(`\n📚 Enrollments (${enrollments.length} courses):`);
    enrollments.forEach(enrollment => {
      console.log(`   - ${enrollment.courseId}`);
      console.log(`     Progress: ${enrollment.progress}%`);
      console.log(`     Completed Lectures: ${enrollment.completedLectures.length}`);
      console.log(`     Status: ${enrollment.status}`);
    });
    
    return { user, enrollments };
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    throw error;
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  try {
    console.log('🚀 Starting localStorage to MongoDB migration...\n');
    
    // Step 1: Connect to MongoDB
    await connectMongoDB();
    
    // Step 2: Extract localStorage data
    const { localStorageData, gamificationData } = await extractLocalStorageData();
    
    // Step 3: Transform data
    const { courses, userGamification } = transformLocalStorageData(localStorageData, gamificationData);
    
    // Step 4: Merge into MongoDB
    const { user, enrollments } = await mergeUserData(courses, userGamification);
    
    // Step 5: Verify migration
    await verifyMigration();
    
    console.log('\n✅ Migration completed successfully!');
    console.log('\n📋 NEXT STEPS:');
    console.log('1. Update frontend to use MongoDB APIs only');
    console.log('2. Remove localStorage dependencies');
    console.log('3. Test user authentication and data access');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Export for testing
module.exports = {
  connectMongoDB,
  extractLocalStorageData,
  transformLocalStorageData,
  mergeUserData,
  verifyMigration,
  runMigration
};

// Run migration if called directly
if (require.main === module) {
  runMigration();
}