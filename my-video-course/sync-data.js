const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const config = require('./config');

async function syncLocalStorageWithMongoDB(progressCallback) {
  try {
    console.log('Starting data sync...');
    if (progressCallback) progressCallback('Starting data sync...');
    
    // Check if MongoDB URI is available
    if (!config.mongodbUri) {
      return { success: false, error: 'MongoDB URI not configured' };
    }
    
    if (progressCallback) progressCallback('Connecting to database...');
    
    // Connect to MongoDB if not already connected
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(config.mongodbUri);
    }
    
    // Wait for connection to be ready with timeout
    await new Promise((resolve, reject) => {
      if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
        resolve();
      } else {
        const timeout = setTimeout(() => {
          reject(new Error('MongoDB connection timeout'));
        }, 5000);
        
        mongoose.connection.once('open', () => {
          clearTimeout(timeout);
          resolve();
        });
        mongoose.connection.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      }
    });
    
    if (progressCallback) progressCallback('Connected! Reading local data...');
    
    // Read localStorage
    const localStoragePath = path.join(__dirname, 'data', 'localStorage.json');
    const localStorage = JSON.parse(fs.readFileSync(localStoragePath, 'utf8'));
    
    const courseNames = Object.keys(localStorage);
    let courseIndex = 0;
    
    for (const courseName in localStorage) {
      courseIndex++;
      const progress = `Syncing course ${courseIndex}/${courseNames.length}: ${courseName}`;
      console.log(progress);
      if (progressCallback) progressCallback(progress);
      
      try {
        // Get all videos from MongoDB
        const courseCollection = mongoose.connection.db.collection(courseName);
        const mongoVideos = await courseCollection.find({}).toArray();
      
      // Create a map of MongoDB videos by ID
      const mongoVideoMap = {};
      mongoVideos.forEach(video => {
        mongoVideoMap[video._id.toString()] = video;
      });
      
      // Update localStorage videos with complete MongoDB data
      const updatedVideos = localStorage[courseName].map(localVideo => {
        const mongoVideo = mongoVideoMap[localVideo._id.toString()];
        if (mongoVideo) {
          // Merge MongoDB data with localStorage watched status
          return {
            ...mongoVideo,
            watched: localVideo.watched || false,
            watchedAt: localVideo.watchedAt || null
          };
        }
        return localVideo; // Keep original if not found in MongoDB
      });
      
      // Add any MongoDB videos not in localStorage
      mongoVideos.forEach(mongoVideo => {
        const exists = localStorage[courseName].find(v => 
          v._id.toString() === mongoVideo._id.toString()
        );
        if (!exists) {
          updatedVideos.push({
            ...mongoVideo,
            watched: false,
            watchedAt: null
          });
        }
      });
      
        localStorage[courseName] = updatedVideos;
        console.log(`Updated ${updatedVideos.length} videos for ${courseName}`);
      } catch (courseErr) {
        console.error(`Error syncing course ${courseName}:`, courseErr);
        // Continue with next course
      }
    }
    
    // Save updated localStorage
    if (progressCallback) progressCallback('Saving synchronized data...');
    fs.writeFileSync(localStoragePath, JSON.stringify(localStorage, null, 2));
    console.log('Data sync completed successfully!');
    if (progressCallback) progressCallback('Sync completed successfully!');
    return { success: true, message: 'Data sync completed successfully!' };
    
  } catch (error) {
    console.error('Error during sync:', error);
    return { success: false, error: error.message };
  }
}

// If called directly, run the sync
if (require.main === module) {
  syncLocalStorageWithMongoDB().then(() => {
    mongoose.connection.close();
  });
}

module.exports = { syncLocalStorageWithMongoDB };