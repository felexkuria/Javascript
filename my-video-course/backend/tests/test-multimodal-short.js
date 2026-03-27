require('dotenv').config();
const videoProcessingService = require('../src/services/videoProcessingService');
const fs = require('fs');
const path = require('path');

async function testMultimodal() {
  console.log('🚀 Starting Multimodal Verification...');
  
  // Mock file
  const mockFile = {
    buffer: fs.readFileSync(path.join(__dirname, '../../frontend/public/img/hero-bg.jpg')),
    originalname: 'test_video.mp4',
    mimetype: 'video/mp4'
  };

  try {
    // Note: This will actually upload to S3 and call AI if configured
    // We are testing if the pipeline runs without reference errors
    console.log('📦 Processing mock video...');
    const result = await videoProcessingService.processVideo(mockFile, 'AI_Test_Course', 'Introduction to SOTA AI');
    
    console.log('✅ Pipeline success!');
    console.log('📊 Result AI Content:', JSON.stringify({
      summary: result.summary,
      visualInsights: result.visualInsights
    }, null, 2));
    
  } catch (error) {
    console.error('❌ Pipeline failed:', error.message);
  }
}

testMultimodal();
