require('dotenv').config();
const s3VideoService = require('../src/services/s3VideoService');

async function testUniversalSigning() {
  console.log('🚀 Testing Universal S3 Signing logic...');

  const mockVideos = [
    { videoUrl: 'https://video-course-app-video-bucket-prod-6m5k2til.s3.amazonaws.com/videos/lesson1.mp4', title: 'Lesson 1' },
    { videoUrl: 'https://video-course-app-video-bucket-prod-6m5k2til.s3.amazonaws.com/videos/lesson2.mp4', title: 'Lesson 2', thumbnailUrl: 'https://video-course-app-video-bucket-prod-6m5k2til.s3.amazonaws.com/thumbnails/lesson2.png' }
  ];

  try {
    console.log('📡 Processing batch signing for 2 videos...');
    const signedVideos = await s3VideoService.processVideoList(mockVideos);
    
    signedVideos.forEach((v, index) => {
      console.log(`🎬 Video ${index + 1}: ${v.title}`);
      console.log(`   └─ URL Sample: ${v.fullVideoUrl?.substring(0, 80)}...`);
      if (v.thumbnailUrl) {
         console.log(`   └─ Thumb Sample: ${v.thumbnailUrl?.substring(0, 80)}...`);
      }
      
      // Verify signature parameters are present
      const hasSignature = v.fullVideoUrl.includes('X-Amz-Signature');
      console.log(`   └─ Signed Correctly: ${hasSignature ? '✅ YES' : '❌ NO'}`);
    });
    
    console.log('✅ Universal Signing Verification: COMPLETE.');
    
  } catch (error) {
    console.error('❌ Signing test failed:', error.message);
  }
}

testUniversalSigning();
