#!/usr/bin/env node

const videoManager = require('../services/videoManager');

async function main() {
  console.log('🎬 Starting video processing...');
  console.log('This will:');
  console.log('  📁 Scan all course directories');
  console.log('  🎥 Process video files with metadata');
  console.log('  📸 Generate thumbnails');
  console.log('  📝 Check for subtitle files');
  console.log('  💾 Save to MongoDB and localStorage');
  console.log('  📊 Generate course summaries');
  console.log('');

  try {
    await videoManager.addVideoFiles();
    console.log('');
    console.log('✅ Video processing completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('  🌐 Visit http://localhost:3000/admin to manage videos');
    console.log('  📚 Check http://localhost:3000/dashboard to see courses');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during video processing:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = main;