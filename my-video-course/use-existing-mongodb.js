const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

async function useExistingData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const collections = await mongoose.connection.db.listCollections().toArray();
    const courseCollections = collections.filter(c => 
      !['gamification', 'video_editing', 'videos', 'videoCourseDB'].includes(c.name)
    );

    console.log('Found course collections:');
    
    const localStorage = {};
    
    for (const collection of courseCollections) {
      const courseName = collection.name;
      console.log(`\n${courseName}:`);
      
      const videos = await mongoose.connection.collection(courseName).find({}).toArray();
      console.log(`- ${videos.length} videos`);
      
      // Convert to localStorage format
      localStorage[courseName] = videos.map(video => ({
        _id: video._id.toString(),
        title: video.title || 'Untitled',
        description: video.description || '',
        videoUrl: video.videoUrl || '',
        watched: video.watched || false,
        watchedAt: video.watchedAt || null,
        thumbnailUrl: video.thumbnailUrl || null
      }));
    }

    // Save to localStorage.json
    const fs = require('fs');
    const path = require('path');
    const localStoragePath = path.join(__dirname, 'backend/src/data/localStorage.json');
    
    fs.writeFileSync(localStoragePath, JSON.stringify(localStorage, null, 2));
    console.log(`\nSaved ${Object.keys(localStorage).length} courses to localStorage.json`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

useExistingData();