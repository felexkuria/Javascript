require('dotenv').config();
const s3VideoService = require('../src/services/aiService'); // Wait, no, s3VideoService
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

async function verifyS3Access() {
  console.log('🚀 Verifying S3 Access with current .env credentials...');
  
  const bucket = process.env.S3_BUCKET_NAME || 'video-course-app-video-bucket-prod-6m5k2til';
  const region = process.env.AWS_REGION || 'us-east-1';
  
  // Test a known key from the logs or common structure
  const testKey = 'videos/aws_agent/6m5k2til-intro.mp4'; 
  
  const s3 = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });

  try {
    console.log(`📡 Checking bucket access: ${bucket}...`);
    const headCommand = new HeadObjectCommand({
      Bucket: bucket,
      Key: testKey
    });
    
    // If this fails, the credentials themselves lack access
    await s3.send(headCommand);
    console.log('✅ Base credentials have HeadObject access!');

    // Test signed URL generation logic
    const s3VideoService = require('../src/services/s3VideoService');
    const testUrl = `https://${bucket}.s3.amazonaws.com/${testKey}`;
    const signedUrl = await s3VideoService.generateSignedUrl(testUrl);
    
    console.log('🔗 Generated Signed URL Sample:', signedUrl.substring(0, 100) + '...');
    console.log('✅ Final Verification: S3 Access Fix Applied.');
    
  } catch (error) {
    console.error('❌ S3 Error Detail:', {
      message: error.message,
      code: error.name,
      requestId: error.$metadata?.requestId,
      httpStatusCode: error.$metadata?.httpStatusCode
    });
    if (error.name === 'SignatureDoesNotMatch') {
      console.error('💡 Hint: Check if your AWS_SECRET_ACCESS_KEY is correct.');
    } else if (error.name === 'NoSuchKey') {
      console.log('✅ Bucket access is OK, but the specific test key was not found.');
      return;
    }
    process.exit(1);
  }
}

verifyS3Access();
