
const path = require('path');
const courseService = require(path.join(__dirname, '../backend/src/services/courseService'));
const dynamodb = require(path.join(__dirname, '../backend/src/utils/dynamodb'));
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

async function smokeTestDeletion() {
    const testCourseName = 'DEVOPS BootCamp  By Tech World With NANA';
    const testSectionId = '1774783487382'; // Intro section
    const testLectureId = '1774783487383'; // First lesson
    
    console.log('--- EXECUTING SAGA: ATOMIC LECTURE PURGE ---');
    try {
        const result = await courseService.deleteLectureData(testCourseName, testSectionId, testLectureId);
        console.log('RESULT:', JSON.stringify(result, null, 2));
        console.log('✅ Smoke test passed: Logic executed without crash.');
    } catch (e) {
        console.error('❌ Smoke test failed:', e.message);
    }
}

smokeTestDeletion();
