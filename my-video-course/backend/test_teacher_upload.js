const videoProcessingService = require('./src/services/videoProcessingService');
const dynamoVideoService = require('./src/services/dynamoVideoService');
const fs = require('fs');
const path = require('path');

async function runTest() {
    console.log('🚀 Starting Teacher Upload Hardening Verification...');
    
    // 1. Create a dummy file with spaces/weird chars in name
    const dummyFile = {
        originalname: 'My Great Video 🚀.mp4',
        mimetype: 'video/mp4',
        buffer: Buffer.from('dummy video content')
    };
    
    // 2. Course name with spaces
    const courseName = 'Metadata Meta';
    const videoTitle = 'Lesson with Spaces';
    
    try {
        console.log(`📡 Processing video for course: "${courseName}", title: "${videoTitle}"`);
        const result = await videoProcessingService.processVideo(dummyFile, courseName, videoTitle);
        
        console.log('✅ Upload Success!');
        console.log('📂 S3 Key:', result.s3Key);
        console.log('🔗 Video URL:', result.videoUrl);
        
        // 3. Verify S3 Key format
        if (result.s3Key.includes('metadata_meta') && result.s3Key.includes('lesson_with_spaces')) {
            console.log('✨ Pattern Check: S3 Key is correctly sanitized (lowercased, spaces replaced).');
        } else {
            console.error('❌ Pattern Check: S3 Key sanitization failed pattern matching!');
        }
        
    } catch (err) {
        console.error('❌ Upload Failed:', err.message);
        if (err.message.includes('Pattern Mismatch')) {
            console.error('😱 Pattern Mismatch detected! Sanitization is still insufficient.');
        }
    }
}

runTest();
