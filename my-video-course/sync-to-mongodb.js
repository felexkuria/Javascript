const fs = require('fs');
const path = require('path');

// Simple sync without MongoDB timeout issues
async function syncData() {
  try {
    const localStoragePath = path.join(__dirname, 'backend/src/data/localStorage.json');
    const localData = JSON.parse(fs.readFileSync(localStoragePath, 'utf8'));
    
    console.log('Current localStorage data:');
    console.log(JSON.stringify(localData, null, 2));
    
    console.log('\nCourses found:', Object.keys(localData));
    
    for (const courseName of Object.keys(localData)) {
      console.log(`\n${courseName}:`);
      console.log(`- Videos: ${localData[courseName].length}`);
      localData[courseName].forEach(video => {
        console.log(`  - ${video.title} (${video._id})`);
      });
    }
    
    console.log('\nData is ready for MongoDB migration when connection is stable.');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

syncData();