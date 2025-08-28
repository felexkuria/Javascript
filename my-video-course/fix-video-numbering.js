const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

const Video = require('./backend/src/models/Video');

async function fixVideoNumbering() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get all courses
    const courses = await Video.distinct('courseName');
    
    for (const courseName of courses) {
      console.log(`\nFixing numbering for: ${courseName}`);
      
      const videos = await Video.find({ courseName }).sort({ title: 1 });
      
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        
        // Extract lesson number from title
        const numberMatch = video.title.match(/(\d+)/);
        const lessonNumber = numberMatch ? parseInt(numberMatch[1]) : i + 1;
        
        await Video.updateOne(
          { _id: video._id },
          { 
            lessonNumber,
            sortOrder: lessonNumber
          }
        );
      }
      
      console.log(`Updated ${videos.length} videos`);
    }

    console.log('\nVideo numbering fixed!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

fixVideoNumbering();