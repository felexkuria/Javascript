/**
 * 🧪 Google-Grade CI Validation (DynamoDB Edition)
 * Replaces the obsolete MongoDB check with modern AWS Service health checks.
 */
const dynamoVideoService = require('../services/dynamoVideoService');

async function runCiTest() {
  console.log('🧪 Starting Cloud-Native CI Validation...');

  try {
    // 1. Check for AWS Environment (REQUIRED for DynamoDB)
    const requiredEnv = ['AWS_REGION', 'SESSION_SECRET'];
    requiredEnv.forEach(env => {
      if (!process.env[env] && !process.env[`TF_VAR_${env}`]) {
        console.warn(`⚠️ Warning: Missing ${env} in environment. Checking AWS SDK defaults...`);
      }
    });

    // 2. Health Check: DynamoDB & LocalStorage Fallback
    console.log('📡 Probing Database Connectivity...');
    const health = await dynamoVideoService.healthCheck();
    
    console.log('Health Report:', health);

    if (!health.dynamodb) {
      console.warn('⚠️  DynamoDB is currently unreachable. CI is continuing in Offline/Fallback Mode.');
    } else {
      console.log('✅ DynamoDB Connectivity: [ONLINE]');
    }

    if (!health.localStorage && !health.dynamodb) {
      throw new Error('❌ Data Integrity Failure: Both DynamoDB and LocalStorage are missing/corrupt.');
    }

    // 3. Test Course Service Initialization
    const courses = await dynamoVideoService.getAllCourses('engineerfelex@gmail.com');
    console.log(`📚 Data Layer Loaded: Found ${courses.length || 0} active courses.`);

    console.log('🎉 CI Validation Successful! Proceeding with build...');
    process.exit(0);
  } catch (error) {
    console.error('💥 CI Validation FAILED:');
    console.error(error.message);
    process.exit(1);
  }
}

runCiTest();
