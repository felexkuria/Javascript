/**
 * 💡 QA INTEGRATION TEST: Neural Core Synchronicity
 * Objective: Verify that AI and Video points are aggregated together in DynamoDB.
 */

const gamificationManager = require('../src/services/gamificationManager');
const dynamoVideoService = require('../src/services/dynamoVideoService');

async function runTest() {
    console.log('🚀 [QA_SYNC_TEST] Initializing Neural Core Verification...');
    const testUser = 'engineerfelex@gmail.com';
    const initialData = await gamificationManager.getUserData(testUser);
    const initialXP = Number(initialData.totalPoints || 0);
    const initialLevel = Number(initialData.level || 1);

    console.log(`📊 Snapshot - User: ${testUser}, Current XP: ${initialXP}, Level: ${initialLevel}`);

    // --- STEP 1: Video Watch Simulation ---
    console.log('🎬 Step 1: Simulating Video Watch (+50 XP)...');
    const courseName = 'AWS Certified Solutions Architect Associate - 2021 [SAA-C02]';
    const videoId = 'test_qa_video_' + Date.now();
    await dynamoVideoService.updateVideoWatchStatus(courseName, videoId, true, testUser);
    
    // --- STEP 2: AI Chat Reward Simulation ---
    console.log('🎯 Step 2: Simulating AI Chat Reward (+10 XP)...');
    await gamificationManager.adjustChatExperiencePoints(testUser, 10);

    // --- STEP 3: Aggregation Verification ---
    console.log('🔍 Step 3: Verifying Aggregated Truth...');
    const finalData = await gamificationManager.getUserData(testUser);
    const finalXP = Number(finalData.totalPoints || 0);
    const expectedXP = initialXP + 60; // 50 (Video) + 10 (AI)

    if (finalXP === expectedXP) {
        console.log(`✅ SUCCESS: XP Aggregated Correctly. (Actual: ${finalXP} == Expected: ${expectedXP})`);
    } else {
        console.error(`❌ FAILURE: XP Drift Detected! (Actual: ${finalXP}, Expected: ${expectedXP})`);
        process.exit(1);
    }

    // --- STEP 4: Level Consistency (Neural Core Linear check) ---
    console.log('🧠 Step 4: Verifying Neural Core Linear Formula...');
    const expectedLevel = Math.floor(finalXP / 1000) + 1;
    if (finalData.level === expectedLevel) {
        console.log(`✅ SUCCESS: Level Calculation Consistent. (Level: ${finalData.level})`);
    } else {
        console.error(`❌ FAILURE: Level Formula Mismatch! (Actual: ${finalData.level}, Expected: ${expectedLevel})`);
        process.exit(1);
    }

    // --- STEP 5: Persistence Verification ---
    console.log('💾 Step 5: Verifying Progress Persistence...');
    const watchedMap = finalData.videosWatched || {};
    if (watchedMap[videoId]) {
        console.log(`✅ SUCCESS: Video ID ${videoId} persisted in watched map.`);
    } else {
        console.error(`❌ FAILURE: Video ID ${videoId} missing from persistence map!`);
        process.exit(1);
    }

    console.log('\n🌟 [TEST_PASSED] Neural Core Synchronicity Verified.');
}

runTest().catch(err => {
    console.error('🔴 QA Test Internal Error:', err);
    process.exit(1);
});
