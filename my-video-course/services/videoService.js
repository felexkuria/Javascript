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
      return JSON.parse(data);
    } catch (err) {
      console.error('Error reading localStorage file:', err);
      return {};
    }
  }

  // Save local storage data
  saveLocalStorage(data) {
    try {
      fs.writeFileSync(this.localStorageFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving localStorage file:', err);
    }
  }

  // Check if MongoDB is connected
  isMongoConnected() {
    try {
      // Check if connection is ready and has a valid client
      return mongoose.connection.readyState === 1 && 
             mongoose.connection.client && 
             mongoose.connection.client.topology && 
             mongoose.connection.client.topology.isConnected();
    } catch (err) {
      console.error('Error checking MongoDB connection:', err);
      return false;
    }
  }

  // Get videos for a course
  async getVideosForCourse(courseName) {
    if (this.isMongoConnected()) {
      try {
        // Create a promise that will timeout after 2 seconds
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('MongoDB operation timed out')), 2000);
        });
        
        // Create the MongoDB query promise
        const queryPromise = mongoose.connection.collection(courseName)
          .find({}).toArray();
        
        // Race the promises - use whichever resolves/rejects first
        const videos = await Promise.race([queryPromise, timeoutPromise]);
        return videos;
      } catch (err) {
        console.error(`Error fetching videos from MongoDB for course ${courseName}:`, err);
        return this.getVideosFromLocalStorage(courseName);
      }
    } else {
      return this.getVideosFromLocalStorage(courseName);
    }
  }

  // Get videos from localStorage
  getVideosFromLocalStorage(courseName) {
    const localStorage = this.getLocalStorage();
    return localStorage[courseName] || [];
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
        return video;
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
    return videos.find(v => v._id.toString() === videoId);
  }

  // Mark a video as watched
  async markVideoAsWatched(courseName, videoId) {
    const now = new Date();
    
    if (this.isMongoConnected()) {
      try {
        const courseCollection = mongoose.connection.collection(courseName);
        await courseCollection.updateOne(
          { _id: new ObjectId(videoId) },
          { $set: { watched: true, watchedAt: now } }
        );
      } catch (err) {
        console.error(`Error updating video in MongoDB:`, err);
      }
    }
    
    // Always update localStorage too for offline sync
    const localStorage = this.getLocalStorage();
    if (!localStorage[courseName]) {
      localStorage[courseName] = [];
    }
    
    // Only update the specific video in the specific course
    const videoIndex = localStorage[courseName].findIndex(v => 
      v._id.toString() === videoId.toString()
    );
    
    if (videoIndex >= 0) {
      localStorage[courseName][videoIndex].watched = true;
      localStorage[courseName][videoIndex].watchedAt = now;
      this.saveLocalStorage(localStorage);
      return true;
    }
    
    return false;
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
          
          for (const video of localVideos) {
            if (video.watched) {
              try {
                // Use a timeout promise to prevent hanging
                const timeoutPromise = new Promise((_, reject) => {
                  setTimeout(() => reject(new Error('MongoDB update timed out')), 2000);
                });
                
                const updatePromise = courseCollection.updateOne(
                  { _id: new ObjectId(video._id) },
                  { $set: { watched: true, watchedAt: video.watchedAt } },
                  { upsert: false }
                );
                
                await Promise.race([updatePromise, timeoutPromise]);
                syncCount++;
              } catch (err) {
                console.error(`Error syncing video ${video._id} to MongoDB:`, err);
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
          
          videos.push({
            _id: id,
            title: path.basename(file, path.extname(file)),
            description: `Video: ${file}`,
            section: section,
            videoUrl: relativePath,
            watched: false,
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