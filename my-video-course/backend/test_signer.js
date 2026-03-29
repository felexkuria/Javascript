const s3VideoService = require('./src/services/s3VideoService');

async function testSigner() {
  console.log('🚥 Starting SOTA Signer Validation...');
  
  const testFiles = [
    'videos/course1/lesson1.mp4',
    'courses/devops/summary.pdf',
    'videos/ai/demo.webm'
  ];

  for (const file of testFiles) {
    const url = await s3VideoService.generateSignedUrl(file);
    console.log(`\n📄 File: ${file}`);
    
    if (url.includes('response-content-type')) {
       console.log('✅ Found ResponseContentType Signaling');
       const match = url.match(/response-content-type=([^&]+)/);
       console.log(`📡 Signal: ${decodeURIComponent(match[1])}`);
    } else {
       console.log('❌ FAILED: No ResponseContentType found in Signed URL');
    }

    if (url.includes('response-content-disposition=inline')) {
       console.log('✅ Found Inline Disposition Signaling');
    } else {
       console.log('❌ FAILED: No Inline Disposition found in Signed URL');
    }
  }
}

testSigner().catch(console.error);
