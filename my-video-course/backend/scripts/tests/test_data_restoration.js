const gamificationManager = require('../../src/services/gamificationManager');

async function testRestoration() {
  const userId = 'engineerfelex@gmail.com';
  console.log(`🚀 Testing Unified Data Restoration for ${userId}...`);

  // This will call the upgraded getUserData which performs normalization and XP recovery.
  const data = await gamificationManager.getUserData(userId);
  
  console.log('🏁 Restored Data:', JSON.stringify({
    points: data.totalPoints,
    level: data.level,
    streak: data.streak,
    watchedCount: Object.keys(data.videosWatched).length
  }, null, 2));

  if (data.totalPoints > 0) {
    console.log(`✅ SUCCESS: XP points successfully recovered: ${data.totalPoints}`);
  } else {
    console.log('❌ FAIL: XP points still 0. Check schema or DynamoDB state.');
  }

  if (data.level >= 1) {
    console.log(`✅ SUCCESS: Level correctly calculated: ${data.level}`);
  }

  if (Object.keys(data.videosWatched).length > 0) {
    console.log(`✅ SUCCESS: Watch history extracted. Course Manifest progress will work.`);
  } else {
    console.log('⚠️ WARNING: No watch history found. Enrollment progress might still show 0%.');
  }
}

testRestoration().catch(console.error);
