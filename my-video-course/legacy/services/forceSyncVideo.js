/**
 * Force Sync Video Utility
 * 
 * This script forces synchronization of a specific video from localStorage to MongoDB
 * Run with: node services/forceSyncVideo.js <courseName> <videoTitle>
 * Example: node services/forceSyncVideo.js dev-ops-bootcamp_202201 lesson13
 */

const mongoose = require('mongoose');
const config = require('../config');
const videoService = require('./videoService');

// Get command line arguments
const courseName = process.argv[2];
const videoTitle = process.argv[3];

if (!courseName || !videoTitle) {
  console.error('Usage: node services/forceSyncVideo.js <courseName> <videoTitle>');
  process.exit(1);
}

async function forceSyncVideo() {
  try {
    console.log(`Attempting to force sync video ${videoTitle} in course ${courseName}...`);
    
    // Connect to MongoDB
    await mongoose.connect(config.mongodbUri, { 
      useNewUrlParser: true, 
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000
    });
    
    console.log('Connected to MongoDB');
    
    // Get the video from localStorage
    const localStorage = videoService.getLocalStorage();
    if (!localStorage[courseName]) {
      console.error(`Course ${courseName} not found in localStorage`);
      process.exit(1);
    }
    
    const localVideo = localStorage[courseName].find(v => v.title === videoTitle);
    if (!localVideo) {
      console.error(`Video ${videoTitle} not found in localStorage for course ${courseName}`);
      process.exit(1);
    }
    
    console.log(`Found video in localStorage:`, localVideo);
    
    // Get the video from MongoDB
    const courseCollection = mongoose.connection.collection(courseName);
    const dbVideo = await courseCollection.findOne({ title: videoTitle });
    
    if (!dbVideo) {
      console.error(`Video ${videoTitle} not found in MongoDB for course ${courseName}`);
      process.exit(1);
    }
    
    console.log(`Found video in MongoDB:`, dbVideo);
    
    // Update the video in MongoDB
    const result = await courseCollection.updateOne(
      { _id: dbVideo._id },
      { $set: { watched: localVideo.watched, watchedAt: localVideo.watchedAt } }
    );
    
    if (result.matchedCount > 0) {
      console.log(`Successfully updated video ${videoTitle} in MongoDB`);
    } else {
      console.error(`Failed to update video ${videoTitle} in MongoDB`);
    }
    
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

forceSyncVideo();