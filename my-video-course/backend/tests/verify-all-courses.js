const dynamoVideoService = require('../src/services/dynamoVideoService');
const dynamodb = require('../src/utils/dynamodb');
require('dotenv').config();

async function verifyAll() {
  console.log('🧪 Verifying all courses for potential render crashes...');
  const userId = 'engineerfelex@gmail.com';

  try {
    const courses = await dynamoVideoService.getAllCourses(userId);
    console.log(`Found ${courses.length} courses.`);

    for (const course of courses) {
      console.log(`\n📘 Course: "${course.name}"`);
      const videos = course.videos || [];
      if (videos.length === 0) {
          console.log('  ⚠️ No videos found.');
          continue;
      }

      // Simulate renderVideo logic
      try {
        const video = videos[0]; // Test first video
        console.log(`  📺 Testing Video: "${video.title}" (ID: ${video._id || video.videoId})`);
        
        // Sidebar grouping (complex logic often crashes here)
        const sections = [];
        const sectionMap = {};
        videos.forEach(v => {
          const sName = v.section || v.sectionTitle || 'Course Content';
          if (!sectionMap[sName]) {
            sectionMap[sName] = { title: sName, lectures: [] };
            sections.push(sectionMap[sName]);
          }
          sectionMap[sName].lectures.push({
            ...v,
            contentId: v.videoId || v._id,
            id: v.videoId || v._id,
            title: v.title
          });
        });
        
        console.log(`  ✅ Logic passed (${sections.length} sections)`);
      } catch (err) {
        console.error(`  ❌ CRASH in logic: ${err.message}`);
      }
    }
    
    console.log('\n✨ ALL COURSES VERIFICATION FINISHED');
    process.exit(0);
  } catch (error) {
    console.error('❌ GLOBAL FAILED:', error.message);
    process.exit(1);
  }
}

verifyAll();
