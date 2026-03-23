const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const User = require('../src/models/User');
const Course = require('../src/models/Course');
const Enrollment = require('../src/models/Enrollment');

async function migrateData() {
  const targetEmail = 'engineerfelex@gmail.com';
  console.log(`🚀 Starting data migration for: ${targetEmail}`);

  try {
    // 1. Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');

    // 2. Load Local Data
    const gamificationPath = path.join(__dirname, '../../data/gamification.json');
    const localStoragePath = path.join(__dirname, '../../data/localStorage.json');

    const gamificationData = JSON.parse(fs.readFileSync(gamificationPath, 'utf8'));
    const localStorageData = JSON.parse(fs.readFileSync(localStoragePath, 'utf8'));

    const sourceData = gamificationData['default_user'];
    if (!sourceData) {
      console.error('❌ Source data for "default_user" not found in gamification.json');
      return;
    }

    // 3. Find/Update User
    let user = await User.findOne({ email: targetEmail });
    if (!user) {
      console.log('👤 Target user not found, creating new...');
      user = new User({
        email: targetEmail,
        name: 'Felex Kuria',
        role: 'admin'
      });
    }

    // Sync gamification stats
    console.log('📊 Syncing gamification stats...');
    if (sourceData.userStats) {
      user.points = sourceData.userStats.totalPoints || 0;
      user.level = sourceData.userStats.currentLevel || 1;
      user.experiencePoints = sourceData.userStats.experiencePoints || 0;
      console.log(`   ✨ Points: ${user.points}, Level: ${user.level}`);
    }

    // 4. Migrate Course Progress (Enrollments)
    console.log('🎓 Migrating course progress...');
    
    // localStorageData is { "Course Title": [ { _id, title, watched, ... } ] }
    for (const [courseTitle, videos] of Object.entries(localStorageData)) {
      const watchedCount = videos.filter(v => v.watched).length;
      if (watchedCount === 0) continue;

      console.log(`   📂 Processing: ${courseTitle} (${watchedCount} watched)`);

      // Find course in MongoDB
      const slug = courseTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const course = await Course.findOne({ 
        $or: [{ title: courseTitle }, { slug: slug }] 
      });

      if (!course) {
        console.warn(`      ⚠️ Course not found in MongoDB: "${courseTitle}". Skipping enrollment.`);
        continue;
      }

      // Find or create enrollment
      let enrollment = await Enrollment.findOne({ userId: targetEmail, courseId: course._id });
      if (!enrollment) {
        enrollment = new Enrollment({
          userId: targetEmail,
          courseId: course._id,
          status: 'active',
          progress: new Map()
        });
      }

      // DEBUG/FIX: If progress is not a Map (e.g., if it was corrupted or set to 0), reset it
      if (!(enrollment.progress instanceof Map)) {
        console.log(`      🛠️ Resetting invalid progress field for course: ${courseTitle}`);
        enrollment.progress = new Map();
      }

      // Map progress
      videos.forEach(v => {
        if (v.watched) {
          const key = v._id || v.videoId;
          if (key) {
            enrollment.progress.set(key, {
              completed: true,
              completedAt: v.watchedAt ? new Date(v.watchedAt) : new Date()
            });
          }
        }
      });

      try {
        await enrollment.save();
      } catch (saveErr) {
        console.error(`      ❌ Failed to save enrollment for ${courseTitle}:`, saveErr.message);
        // Fallback: forced reset if it still fails
        if (saveErr.message.includes('Cannot create field')) {
           console.log('      ♻️ Attempting forced reset of enrollment document...');
           await Enrollment.deleteOne({ _id: enrollment._id });
           const newEnrol = new Enrollment({
              userId: targetEmail,
              courseId: course._id,
              status: 'active',
              progress: new Map()
           });
           videos.forEach(v => { if (v.watched) newEnrol.progress.set(v._id || v.videoId, { completed: true, completedAt: v.watchedAt ? new Date(v.watchedAt) : new Date() }); });
           await newEnrol.save();
        }
      }
      
      // Ensure user is linked to enrollment
      if (!user.enrolledCourses.includes(course._id)) {
        user.enrolledCourses.push(course._id);
      }
    }

    await user.save();
    console.log('✅ User enrollments and progress updated in MongoDB');

    console.log('\n✨ Migration Complete!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

migrateData();
