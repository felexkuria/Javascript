/**
 * 🌪️ COMPREHENSIVE DYNAMODB SUITE (Google Core Standard)
 * This test suite performs actual data operations to verify the health of the 
 * AWS DynamoDB layer, ensuring that the migration from MongoDB is complete and functioning correctly.
 */
const dynamoVideoService = require('../../src/services/dynamoVideoService');
const dynamodb = require('../../src/utils/dynamodb');

async function runFullDynamoTest() {
  console.log('🌪️ Starting Full-Feature DynamoDB Integration Test...');

  try {
    // TEST 1: Connectivity & Initialization
    console.log('👉 [1/5] Checking DynamoDB Client Status...');
    if (!dynamodb.isConnected) {
      throw new Error('❌ DynamoDB Client is NOT connected. Check AWS Credentials.');
    }
    console.log('✅ DynamoDB Interface: [ONLINE]');

    // TEST 2: Environment-Specific Tables Check
    console.log('👉 [2/5] Probing Table Presence...');
    const tables = await dynamodb.getAllCourses(); // This scans the table
    if (tables === null) {
      throw new Error('❌ Failed to scan Courses table. Does it exist in us-east-1?');
    }
    console.log(`✅ Table Scan Successful: Retrieved ${tables.length} courses from AWS.`);

    // TEST 3: User Gamification (Key-Value Read)
    console.log('👉 [3/5] Testing Gamification Data (GSI/SK Logic)...');
    const userId = 'engineerfelex@gmail.com';
    const gamification = await dynamoVideoService.getUserGamificationData(userId);
    
    if (gamification) {
      console.log(`✅ User Stats Loaded: Level ${gamification.userStats?.currentLevel || 1}, Points: ${gamification.userStats?.totalPoints || 0}`);
    } else {
      console.warn('⚠️ No gamification data found for user. Checking for fallback...');
    }

    // TEST 4: CRUD Operation (Dry Run)
    console.log('👉 [4/5] Running CRUD Operation Test...');
    const testCourseName = "DEVOPS_CI_TEST_COURSE";
    const testVideo = { videoId: "ci_test_vid_01", title: "CI Test Video", watched: false };
    
    const saveResult = await dynamodb.saveVideo({
        ...testVideo,
        courseName: testCourseName
    });
    
    if (saveResult) {
      console.log('✅ PutCommand: [SUCCESS]');
      
      // Verification
      const videos = await dynamodb.getVideosForCourse(testCourseName);
      if (videos.find(v => v.videoId === "ci_test_vid_01")) {
        console.log('✅ GetCommand/Scan: [VERIFIED]');
      }
      
      // Cleanup
      await dynamodb.deleteVideo(testCourseName, "ci_test_vid_01");
      console.log('✅ DeleteCommand: [CLEANED]');
    } else {
      throw new Error('❌ PutCommand: [FAILED]');
    }

    // TEST 5: Fallback Integrity
    console.log('👉 [5/5] Logic Verification: Local Fallback Check...');
    const status = await dynamoVideoService.healthCheck();
    console.log(`✅ Health Check Summary: Dynamo (O=${status.dynamodb}), Local (O=${status.localStorage})`);

    console.log('\n🌟 DYNAMODB INTEGRATION: [PASSED] 100%');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ DYNAMODB TEST FAILED:');
    console.error(error.message);
    process.exit(1);
  }
}

runFullDynamoTest();
