const fetch = require('node-fetch');

async function testCaptions() {
  try {
    // Test with your S3 video
    const response = await fetch('http://localhost:8080/generate-captions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoUrl: 'https://video-course-bucket-047ad47c.s3.us-east-1.amazonaws.com/videos/dev-ops-bootcamp_202201/1756426922323_lesson_2.mp4',
        courseName: 'dev-ops-bootcamp_202201',
        videoTitle: 'lesson_2',
        s3Bucket: 'video-course-bucket-047ad47c'
      })
    });
    
    const result = await response.json();
    console.log('Caption generation result:', result);
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testCaptions();