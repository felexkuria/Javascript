const s3VideoService = require('./my-video-course/backend/src/services/s3VideoService');
const testUrl = 's3://video-course-app-video-bucket-prod-6m5k2til/courses/hashicorp_certified_terraform_associate_-_hands-on_labs/sections/default-section/resources/lesson30.mp4';

async function test() {
    console.log('Testing video URL:', testUrl);
    const signed = await s3VideoService.generateSignedUrl(testUrl);
    console.log('Generated Signed URL:', signed);
}

test().catch(console.error);
