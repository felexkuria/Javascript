const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: './backend/.env' });

const Course = require('./backend/src/models/Course');
const Video = require('./backend/src/models/Video');

async function migrateData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Read localStorage data
    const localStoragePath = path.join(__dirname, 'backend/src/data/localStorage.json');
    const localData = JSON.parse(fs.readFileSync(localStoragePath, 'utf8'));

    for (const courseName of Object.keys(localData)) {
      // Create course
      await Course.findOneAndUpdate(
        { name: courseName },
        { name: courseName },
        { upsert: true, new: true }
      );
      console.log(`Created course: ${courseName}`);

      // Create videos
      const videos = localData[courseName];
      for (const video of videos) {
        await Video.findOneAndUpdate(
          { _id: video._id },
          {
            ...video,
            courseName,
            _id: video._id
          },
          { upsert: true, new: true }
        );
      }
      console.log(`Created ${videos.length} videos for ${courseName}`);
    }

    console.log('Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrateData();