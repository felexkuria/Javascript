const dynamoVideoService = require('../src/services/dynamoVideoService');
const dynamodb = require('../src/utils/dynamodb');



async function verifyCurriculum() {
  console.log('🧪 Starting Curriculum Management Verification...');
  
  const testUser = 'engineerfelex@gmail.com'; // Admin for easier access
  const testCourseName = 'CLICourse';
  
  try {
    // 0. Ensure course exists
    console.log('📚 0. Ensuring Course Exists...');
    let course = await dynamoVideoService.getCourseByTitle(testCourseName, testUser);
    if (!course) {
        console.log('Creating test course...');
        await dynamodb.saveCourse({
            name: testCourseName,
            title: testCourseName,
            instructorId: testUser,
            videos: [],
            sections: []
        });
        course = await dynamoVideoService.getCourseByTitle(testCourseName, testUser);
    }
    console.log('✅ Course ready');

    // 1. Add Section
    console.log('📝 1. Testing Add Section...');
    const sectionTitle = 'Test Section ' + Date.now();
    course.sections = course.sections || [];
    const newSection = {
      _id: 'sec_' + Date.now(),
      title: sectionTitle,
      lectures: []
    };
    course.sections.push(newSection);
    await dynamodb.saveCourse(course);
    
    // Verify persistence
    let updatedCourse = await dynamoVideoService.getCourseByTitle(testCourseName, testUser);
    const savedSection = updatedCourse.sections.find(s => s._id === newSection._id);
    if (!savedSection || savedSection.title !== sectionTitle) throw new Error('Section failed to persist');
    console.log('✅ Section added and verified');

    // 2. Add Lecture to Section
    console.log('📺 2. Testing Add Lecture to Section...');
    const lectureTitle = 'Test Lecture ' + Date.now();
    const newLecture = {
        _id: 'lect_' + Date.now(),
        title: lectureTitle,
        sectionId: savedSection._id,
        watched: false
    };
    
    // Manual sync for test
    const sIdx = updatedCourse.sections.findIndex(s => s._id === savedSection._id);
    updatedCourse.sections[sIdx].lectures.push(newLecture);
    updatedCourse.videos = updatedCourse.videos || [];
    updatedCourse.videos.push({ ...newLecture, section: savedSection._id });
    
    await dynamodb.saveCourse(updatedCourse);
    
    // Verify persistence
    updatedCourse = await dynamoVideoService.getCourseByTitle(testCourseName, testUser);
    const savedLecture = updatedCourse.sections[sIdx].lectures.find(l => l._id === newLecture._id);
    if (!savedLecture || savedLecture.title !== lectureTitle) throw new Error('Lecture failed to persist in section');
    
    const savedFlatVideo = updatedCourse.videos.find(v => v._id === newLecture._id);
    if (!savedFlatVideo || savedFlatVideo.section !== savedSection._id) throw new Error('Lecture failed to persist in flat list');
    console.log('✅ Lecture added to both nested and flat structures');

    // 3. Rename Section
    console.log('✏️ 3. Testing Rename Section...');
    const renamedTitle = 'Renamed Section ' + Date.now();
    updatedCourse.sections[sIdx].title = renamedTitle;
    await dynamodb.saveCourse(updatedCourse);
    
    updatedCourse = await dynamoVideoService.getCourseByTitle(testCourseName, testUser);
    if (updatedCourse.sections[sIdx].title !== renamedTitle) throw new Error('Section rename failed');
    console.log('✅ Section rename verified');

    // 4. Delete Section
    console.log('🗑️ 4. Testing Delete Section...');
    updatedCourse.sections = updatedCourse.sections.filter(s => s._id !== newSection._id);
    await dynamodb.saveCourse(updatedCourse);
    
    updatedCourse = await dynamoVideoService.getCourseByTitle(testCourseName, testUser);
    if (updatedCourse.sections.find(s => s._id === newSection._id)) throw new Error('Section deletion failed');
    console.log('✅ Section deletion verified');

    console.log('\n✨ CURRICULUM VERIFICATION COMPLETED SUCCESSFULLY');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ VERIFICATION FAILED:', error.message);
    process.exit(1);
  }
}

verifyCurriculum();
