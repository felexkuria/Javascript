const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const ObjectId = mongoose.Types.ObjectId;

// Service to handle video data with MongoDB and localStorage fallback
class VideoService {
  constructor() {
    this.localStorageFile = path.join(__dirname, '..', 'data', 'localStorage.json');
    this.ensureLocalStorageExists();
  }

  // Make sure the localStorage file exists
  ensureLocalStorageExists() {
    const dataDir = path.dirname(this.localStorageFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.localStorageFile)) {
      fs.writeFileSync(this.localStorageFile, JSON.stringify({}), 'utf8');
    }
  }

  // Get local storage data
  getLocalStorage() {
    try {
      const data = fs.readFileSync(this.localStorageFile, 'utf8');
      const parsed = JSON.parse(data);
      console.log(`Read localStorage file with ${Object.keys(parsed).length} courses`);
      return parsed;
    } catch (err) {
      console.error('Error reading localStorage file:', err);
      return {};
    }
  }

  // Save local storage data
  saveLocalStorage(data) {
    try {
      fs.writeFileSync(this.localStorageFile, JSON.stringify(data, null, 2), 'utf8');
      console.log(`Saved localStorage file with ${Object.keys(data).length} courses`);
    } catch (err) {
      console.error('Error saving localStorage file:', err);
    }
  }

  // Check if MongoDB is connected
  isMongoConnected() {
    // Check if MongoDB URI is defined
    const config = require('../config');
    if (!config.mongodbUri) {
      console.log('MongoDB URI is not defined in config');
      return false;
    }
    try {
      // First check if we're in offline mode
      if (global.isOfflineMode === true) {
        console.log('System is in offline mode');
        return false;
      }
      
      // Check if connection is ready and has a valid client
      const isConnected = mongoose.connection.readyState === 1 && 
                         mongoose.connection.client && 
                         mongoose.connection.client.topology;
      
      // If not connected, set offline mode
      if (!isConnected) {
        console.log('MongoDB connection is not ready, setting offline mode');
        global.isOfflineMode = true;
      } else {
        console.log('MongoDB is connected');
      }
      
      return isConnected;
    } catch (err) {
      console.error('Error checking MongoDB connection:', err);
      global.isOfflineMode = true;
      return false;
    }
  }

  // Get videos for a course
  async getVideosForCourse(courseName) {
    console.log(`Getting videos for course: ${courseName}`);
    if (this.isMongoConnected()) {
      try {
        console.log(`MongoDB is connected, fetching videos for ${courseName}`);
        // Create a promise that will timeout after 2 seconds
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('MongoDB operation timed out')), 2000);
        });
        
        // Create the MongoDB query promise
        const queryPromise = mongoose.connection.collection(courseName)
          .find({}).toArray();
        
        // Race the promises - use whichever resolves/rejects first
        const videos = await Promise.race([queryPromise, timeoutPromise]);
        console.log(`Retrieved ${videos.length} videos from MongoDB for course ${courseName}`);
        return videos;
      } catch (err) {
        console.error(`Error fetching videos from MongoDB for course ${courseName}:`, err);
        return this.getVideosFromLocalStorage(courseName);
      }
    } else {
      console.log(`MongoDB not connected, using localStorage for course ${courseName}`);
      return this.getVideosFromLocalStorage(courseName);
    }
  }

  // Get videos from localStorage
  getVideosFromLocalStorage(courseName) {
    const localStorage = this.getLocalStorage();
    const videos = localStorage[courseName] || [];
    
    // Filter out any undefined or invalid entries
    const validVideos = videos.filter(v => v && typeof v === 'object');
    
    console.log(`Retrieved ${validVideos.length} videos from localStorage for course ${courseName}`);
    return validVideos;
  }

  // Get a single video by ID
  async getVideoById(courseName, videoId) {
    if (this.isMongoConnected()) {
      try {
        // Create a promise that will timeout after 2 seconds
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('MongoDB operation timed out')), 2000);
        });
        
        // Create the MongoDB query promise
        const queryPromise = mongoose.connection.collection(courseName)
          .findOne({ _id: new ObjectId(videoId) });
        
        // Race the promises - use whichever resolves/rejects first
        const video = await Promise.race([queryPromise, timeoutPromise]);
        
        if (video) {
          return video;
        } else {
          console.log(`Video ${videoId} not found in MongoDB, checking localStorage`);
          return this.getVideoFromLocalStorage(courseName, videoId);
        }
      } catch (err) {
        console.error(`Error fetching video from MongoDB:`, err);
        return this.getVideoFromLocalStorage(courseName, videoId);
      }
    } else {
      return this.getVideoFromLocalStorage(courseName, videoId);
    }
  }

  // Get a single video from localStorage
  getVideoFromLocalStorage(courseName, videoId) {
    const videos = this.getVideosFromLocalStorage(courseName);
    const video = videos.find(v => v && v._id && v._id.toString() === videoId);
    
    // If video not found, return null instead of undefined
    return video || null;
  }

  // Mark a video as watched
  async markVideoAsWatched(courseName, videoId) {
    const now = new Date();
    let videoTitle = null;
    let success = false;
    
    console.log(`Marking video as watched: ${courseName}/${videoId}`);
    
    // Try MongoDB first if connected
    if (this.isMongoConnected()) {
      try {
        const courseCollection = mongoose.connection.collection(courseName);
        
        // Try to update by ID
        let result = await courseCollection.updateOne(
          { _id: new ObjectId(videoId) },
          { $set: { watched: true, watchedAt: now } }
        );
        
        if (result.matchedCount > 0) {
          console.log(`Updated video in MongoDB by ID`);
          success = true;
          
          // Get the video title for localStorage update
          const video = await courseCollection.findOne({ _id: new ObjectId(videoId) });
          if (video) {
            videoTitle = video.title;
          }
        }
      } catch (err) {
        console.error(`Error updating video in MongoDB:`, err);
      }
    }
    
    // Update localStorage
    const localStorage = this.getLocalStorage();
    if (!localStorage[courseName]) {
      localStorage[courseName] = [];
      console.log(`Created new localStorage entry for course ${courseName}`);
    }
    
    // Find the video in localStorage by ID
    const videoIndex = localStorage[courseName].findIndex(v => 
      v && v._id && v._id.toString() === videoId.toString()
    );
    console.log(`Video index in localStorage: ${videoIndex}`);
    
    if (videoIndex >= 0) {
      // Update localStorage
      localStorage[courseName][videoIndex].watched = true;
      localStorage[courseName][videoIndex].watchedAt = now;
      videoTitle = localStorage[courseName][videoIndex].title;
      this.saveLocalStorage(localStorage);
      console.log(`Marked video ${videoTitle} as watched in localStorage`);
      success = true;
    } else if (videoTitle) {
      // If not found by ID but we have the title from MongoDB, create a new entry
      const newVideo = {
        _id: new ObjectId(videoId),
        title: videoTitle,
        watched: true,
        watchedAt: now
      };
      localStorage[courseName].push(newVideo);
      this.saveLocalStorage(localStorage);
      console.log(`Added video ${videoTitle} to localStorage as watched`);
      success = true;
    } else {
      // Try to find the video by ID in the course collection
      try {
        if (this.isMongoConnected()) {
          const courseCollection = mongoose.connection.collection(courseName);
          const video = await courseCollection.findOne({ _id: new ObjectId(videoId) });
          if (video) {
            // Add to localStorage
            const newVideo = {
              _id: new ObjectId(videoId),
              title: video.title || 'Unknown',
              watched: true,
              watchedAt: now
            };
            localStorage[courseName].push(newVideo);
            this.saveLocalStorage(localStorage);
            console.log(`Added video ${newVideo.title} to localStorage as watched (found in MongoDB)`);
            success = true;
          } else {
            console.log(`Video ${videoId} not found in MongoDB collection ${courseName}`);
          }
        } else {
          console.log(`Video ${videoId} not found in localStorage and MongoDB is not connected`);
        }
      } catch (err) {
        console.error(`Error finding video in MongoDB:`, err);
        console.log(`Video ${videoId} not found in localStorage or MongoDB`);
      }
    }
    
    return success;
  }

  // Sync localStorage with MongoDB when connection is available
  async syncWithMongoDB() {
    try {
      // Double-check connection with timeout
      const connectionCheck = new Promise((resolve) => {
        if (mongoose.connection.readyState === 1) {
          resolve(true);
        } else {
          // Wait a bit to see if connection establishes
          setTimeout(() => {
            resolve(mongoose.connection.readyState === 1);
          }, 1000);
        }
      });
      
      const isConnected = await connectionCheck;
      if (!isConnected) {
        console.log('MongoDB not connected, cannot sync');
        return false;
      }

      const localStorage = this.getLocalStorage();
      let syncCount = 0;
      
      for (const courseName in localStorage) {
        try {
          const courseCollection = mongoose.connection.collection(courseName);
          const localVideos = localStorage[courseName];
          
          // First, get all videos from MongoDB to compare
          const dbVideos = await courseCollection.find({}).toArray();
          const dbVideoMap = {};
          dbVideos.forEach(video => {
            dbVideoMap[video.title] = video;
          });
          
          for (const localVideo of localVideos) {
            if (localVideo.watched) {
              try {
                // Find matching video in MongoDB by title
                const dbVideo = dbVideoMap[localVideo.title];
                
                if (dbVideo) {
                  // Use a timeout promise to prevent hanging
                  const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('MongoDB update timed out')), 2000);
                  });
                  
                  const updatePromise = courseCollection.updateOne(
                    { _id: dbVideo._id },
                    { $set: { watched: true, watchedAt: localVideo.watchedAt } },
                    { upsert: false }
                  );
                  
                  await Promise.race([updatePromise, timeoutPromise]);
                  syncCount++;
                  console.log(`Synced video ${localVideo.title} to MongoDB`);
                } else {
                  console.log(`Could not find matching video for ${localVideo.title} in MongoDB`);
                }
              } catch (err) {
                console.error(`Error syncing video ${localVideo.title} to MongoDB:`, err);
              }
            }
          }
        } catch (err) {
          console.error(`Error accessing collection ${courseName}:`, err);
        }
      }
      
      console.log(`Synced ${syncCount} videos to MongoDB`);
      return true;
    } catch (err) {
      console.error('Error in syncWithMongoDB:', err);
      return false;
    }
  }

  // Initialize videos from filesystem if not in MongoDB or localStorage
  async initializeVideosFromFilesystem(courseName, baseDir) {
    const courseDir = path.join(baseDir, courseName);
    if (!fs.existsSync(courseDir)) {
      return [];
    }

    // Check if videos already exist in MongoDB or localStorage
    let existingVideos = [];
    if (this.isMongoConnected()) {
      try {
        const courseCollection = mongoose.connection.collection(courseName);
        existingVideos = await courseCollection.find({}).toArray();
        if (existingVideos.length > 0) {
          console.log(`Found ${existingVideos.length} existing videos in MongoDB for ${courseName}`);
          return existingVideos;
        }
      } catch (err) {
        console.error(`Error checking existing videos in MongoDB:`, err);
      }
    } else {
      // Check localStorage
      const localStorage = this.getLocalStorage();
      if (localStorage[courseName] && localStorage[courseName].length > 0) {
        console.log(`Found ${localStorage[courseName].length} existing videos in localStorage for ${courseName}`);
        return localStorage[courseName];
      }
    }

    // If no existing videos, scan the filesystem
    console.log(`Scanning filesystem for videos in ${courseName}...`);
    const videos = [];
    const traverseDirectory = (dir, section) => {
      const files = fs.readdirSync(dir);
      
      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          traverseDirectory(filePath, file);
        } else if (file.toLowerCase().endsWith('.mp4')) {
          const relativePath = path.relative(baseDir, filePath);
          const id = new ObjectId();
          const title = path.basename(file, path.extname(file));
          
          // Make sure all videos start as unwatched
          videos.push({
            _id: id,
            title: title,
            description: `Video: ${file}`,
            section: section,
            videoUrl: relativePath,
            watched: false, // Always initialize as unwatched
            watchedAt: null
          });
        }
      });
    };
    
    traverseDirectory(courseDir, null);
    
    if (videos.length === 0) {
      console.log(`No videos found in filesystem for ${courseName}`);
      return [];
    }
    
    console.log(`Found ${videos.length} videos in filesystem for ${courseName}`);
    
    // Sort videos by lesson number with proper handling of double-digit numbers
    videos.sort((a, b) => {
      const aMatch = a.title.match(/\d+/);
      const bMatch = b.title.match(/\d+/);
      const aNum = aMatch ? parseInt(aMatch[0], 10) : 0;
      const bNum = bMatch ? parseInt(bMatch[0], 10) : 0;
      
      // Log sorting for debugging
      console.log(`Sorting videos: ${a.title} (${aNum}) vs ${b.title} (${bNum})`);
      
      return aNum - bNum;
    });
    
    // Save to localStorage
    const localStorage = this.getLocalStorage();
    localStorage[courseName] = videos;
    this.saveLocalStorage(localStorage);
    
    // Save to MongoDB if connected
    if (this.isMongoConnected()) {
      try {
        const courseCollection = mongoose.connection.collection(courseName);
        // Check if collection is empty before inserting
        const count = await courseCollection.countDocuments();
        if (count === 0) {
          await courseCollection.insertMany(videos);
          console.log(`Inserted ${videos.length} videos into MongoDB for ${courseName}`);
        } else {
          console.log(`MongoDB collection for ${courseName} already has ${count} videos, skipping insert`);
        }
      } catch (err) {
        console.error(`Error saving videos to MongoDB:`, err);
      }
    }
    
    return videos;
  }
}

module.exports = new VideoService();