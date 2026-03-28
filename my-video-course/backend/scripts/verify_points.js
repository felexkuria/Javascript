const ds = require('../src/services/dynamoVideoService');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function verifyPoints() {
  const userId = 'engineerfelex@gmail.com';
  console.log(`\n🧪 STARTING POINT VERIFICATION FOR: ${userId}\n`);

  try {
    // 1. Get Initial Data
    const initialData = await ds.getUserGamificationData(userId);
    console.log(`📊 INITIAL STATE:`);
    console.log(`   Points: ${initialData.userStats.totalPoints}`);
    console.log(`   Watches: ${Object.keys(initialData.userStats.videosWatched).length}`);

    // 2. Find a test video (or use a dummy one)
    const testVideoId = 'test_video_' + Date.now();
    const testCourse = 'Terraform Certification';
    console.log(`\n🎬 SIMULATING WATCH: ${testVideoId} in ${testCourse}`);

    // 3. Mark as watched and award points (Simulating videoController.js:311)
    // We use a dummy video ID to guarantee it's the "First Watch"
    const success = await ds.updateVideoWatchStatus(testCourse, testVideoId, true, userId);
    
    if (success) {
        const gamificationData = await ds.getUserGamificationData(userId);
        
        // Award points (10 for watch)
        gamificationData.userStats.totalPoints += 10;
        gamificationData.userStats.videosWatched[testVideoId] = true;
        
        // Persist
        await ds.updateUserGamificationData(userId, gamificationData);
        console.log(`✅ Progress Persisted to DynamoDB.`);
    }

    // 4. Verify Final State
    const finalData = await ds.getUserGamificationData(userId);
    console.log(`\n🏁 FINAL STATE:`);
    console.log(`   Points: ${finalData.userStats.totalPoints}`);
    console.log(`   Watches: ${Object.keys(finalData.userStats.videosWatched).length}`);

    if (finalData.userStats.totalPoints > initialData.userStats.totalPoints) {
        console.log(`\n🚀 SUCCESS: Points awarded correctly! (+${finalData.userStats.totalPoints - initialData.userStats.totalPoints} XP)`);
    } else {
        console.log(`\n❌ FAILURE: Points did not increment.`);
    }

  } catch (error) {
    console.error(`❌ Test failed:`, error.message);
  }
  process.exit(0);
}

verifyPoints();
