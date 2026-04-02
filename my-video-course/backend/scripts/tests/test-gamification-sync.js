const gamificationManager = require('../../src/services/gamificationManager');
const dynamoVideoService = require('../../src/services/dynamoVideoService');

async function testSync() {
  const userId = 'engineerfelex@gmail.com';
  console.log(`🚀 Testing Unified Gamification Sync for ${userId}...`);

  // 1. Get data via Manager (Neural Core)
  const coreData = await gamificationManager.getUserData(userId);
  console.log('🧠 Neural Core Data:', JSON.stringify({
    points: coreData.totalPoints,
    level: coreData.level,
    streak: coreData.streak
  }));

  // 2. Clear out any "Recovery" artifacts from DynamoVideoService logic if any remain
  // Actually, we deleted getUserGamificationData from DynamoVideoService, so it should fail if called.
  try {
    await dynamoVideoService.getUserGamificationData(userId);
    console.log('❌ FAIL: dynamoVideoService.getUserGamificationData still exists!');
  } catch (e) {
    console.log('✅ SUCCESS: dynamoVideoService.getUserGamificationData has been removed.');
  }

  // 3. Verify watch status awarding (now uses Manager)
  console.log('🎬 Testing Video Watch XP Award (Consolidated)...');
  await dynamoVideoService.updateVideoWatchStatus('devops_bootcamp', 'lesson10', true, userId);
  
  const finalData = await gamificationManager.getUserData(userId);
  console.log('🏁 Final Unified Data:', JSON.stringify({
    points: finalData.totalPoints,
    level: finalData.level,
    streak: finalData.streak
  }));

  if (finalData.totalPoints >= coreData.totalPoints + 50) {
    console.log('✨ SUCCESS: Gamification is now unified and consistent!');
  } else {
    console.log('⚠️ WARNING: Points did not increment as expected.');
  }
}

testSync().catch(console.error);
