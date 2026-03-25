const dynamoVideoService = require('../src/services/dynamoVideoService');
const dynamodb = require('../src/utils/dynamodb');
require('dotenv').config();


async function reproduceIssue() {
  console.log('🧪 Starting Reproduction of Video Load Issue...');
  
  // The user's course name from the URL (decoded)
  const courseName = '[TutsNode.com] - Video Editing in DaVinci Resolve 16-17 Beginner to Advanced';
  const videoId = '689c74e8824113979c625468';
  const userId = 'engineerfelex@gmail.com'; // Use a valid user

  try {
    console.log(`🔍 1. Searching for course: "${courseName}"`);
    const course = await dynamoVideoService.getCourseByTitle(courseName, userId);
    
    if (!course) {
        console.log('❌ Course not found!');
        // List all courses to see what we have
        const allCourses = await dynamoVideoService.getAllCourses(userId);
        console.log('Available courses:', allCourses.map(c => c.name));
        return;
    }
    console.log('✅ Course found:', course.name);

    console.log(`🔍 2. Searching for video: "${videoId}"`);
    const videos = course.videos || [];
    const video = videos.find(v => (v.videoId === videoId) || (v._id === videoId) || (v.title === videoId)) || videos[0];

    if (!video) {
        console.log('❌ Video not found in course!');
        return;
    }
    console.log('✅ Video found:', video.title);
    
    console.log('🔍 3. Simulating Sidebar Grouping...');
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
    console.log(`✅ Grouped into ${sections.length} sections`);

    console.log('✅ Reproduction script finished successfully (No server-side crash detected in logic)');
    process.exit(0);
  } catch (error) {
    console.error('❌ REPRODUCTION FAILED WITH ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

reproduceIssue();
