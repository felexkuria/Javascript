const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const config = require('./config');
const videoRoutes = require('./routes/videoRoutes');
const ObjectId = mongoose.Types.ObjectId;
// .ics after travesring and adding video check video lenght  if video a and video b duratiion is 1 hour
const app = express();

// Connect to MongoDB with offline fallback
let isOfflineMode = false;

const connectToMongoDB = () => {
  return mongoose.connect(config.mongodbUri, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000
  })
  .then(() => {
    console.log('Connected to MongoDB');
    isOfflineMode = false;
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    console.log('Running in offline mode with localStorage');
    isOfflineMode = true;
    // Don't exit the process, continue in offline mode
  });
};

// Initial connection attempt
connectToMongoDB();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// Middleware to serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to check for caption files
const checkForCaptions = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.srt';
};

// Function to add video files to database
const addVideoFiles = async () => {
  try {
    if (!mongoose.connection.readyState) {
      console.warn('MongoDB connection not established. Videos will not be added to database.');
      return; // Exit function instead of throwing error
    }

    const videoDir = path.join(__dirname, 'public', 'videos');

    const traverseDirectory = (dir, section) => {
      try {
        console.log(`Traversing directory: ${dir}`);
        const files = fs.readdirSync(dir);
        let videoDocuments = [];

        files.forEach(file => {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);

          if (stat.isDirectory()) {
            console.log(`Found directory: ${file}`);
            videoDocuments = videoDocuments.concat(traverseDirectory(filePath, file));
          } else if (stat.isFile()) {
            console.log(`Found file: ${file}`);
            const ext = path.extname(file).toLowerCase();
            if (ext !== '.mp4') {
              return;
            }
            const isCaption = checkForCaptions(filePath);
            const property = isCaption ? 'captionsUrl' : 'videoUrl';
            const url = path.relative(videoDir, filePath);

            videoDocuments.push({
              title: path.basename(file, path.extname(file)),
              description: `Description for ${file}`,
              section: section,
              watched: false,
              watchedAt: null,
              [property]: url
            });
          }
        });

        return videoDocuments;
      } catch (err) {
        console.error(`Error traversing direc ${dir}:`, err);
        return [];
      }
    };

    const courseFolders = fs.readdirSync(videoDir).filter(folder => {
      return fs.statSync(path.join(videoDir, folder)).isDirectory();
    });

    for (const courseFolder of courseFolders) {
      console.log(`Processing course folder: ${courseFolder}`);
      const courseCollection = mongoose.connection.collection(courseFolder);

      // Clear existing data
      await courseCollection.deleteMany({});
      console.log(`Cleared existing data for collection: ${courseFolder}`);

      const videoDocuments = traverseDirectory(path.join(videoDir, courseFolder), null);
      if (videoDocuments.length > 0) {
        console.log(`Adding ${videoDocuments.length} videos to collection: ${courseFolder}`);
        await courseCollection.insertMany(videoDocuments);
      } else {
        console.log(`No videos found for course: ${courseFolder}`);
      }
    }
  } catch (err) {
    console.error('Error in addVideoFiles:', err);
    throw err;
  }
};

// View engine setup
app.set('view engine', 'ejs');


// Routes

app.use('/videos', videoRoutes);

// Default route with error handling
app.get('/', (req, res) => {
  try {
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Error redirecting to dashboard:', err);
    res.status(500).send('Server Error');
  }
});

// Upload route
app.get('/upload', (req, res) => {
  try {
    res.render('upload');
  } catch (err) {
    console.error('Error rendering upload page:', err);
    res.status(500).send('Server Error');
  }
});

// Dashboard route with improved error handling
app.get('/dashboard', async (req, res) => {
  try {
    const videoDir = path.join(__dirname, 'public', 'videos');

    if (!fs.existsSync(videoDir)) {
      throw new Error('Video directory not found');
    }

    const courseFolders = fs.readdirSync(videoDir).filter(folder => {
      return fs.statSync(path.join(videoDir, folder)).isDirectory();
    });

    let courses = [];
    
    // Check if we're in offline mode
    if (isOfflineMode) {
      console.log('Dashboard: Running in offline mode, using localStorage');
      // Use localStorage data
      const localStorage = videoService.getLocalStorage();
      
      for (const courseFolder of courseFolders) {
        const courseVideos = localStorage[courseFolder] || [];
        
        // Sort videos by lesson number for consistent ordering
        const sortedVideos = [...courseVideos].sort((a, b) => {
          const aNum = parseInt(a.title.match(/\d+/)) || 0;
          const bNum = parseInt(b.title.match(/\d+/)) || 0;
          return aNum - bNum;
        });
        
        courses.push({
          name: courseFolder,
          videos: sortedVideos,
          offlineMode: true
        });
      }
    }
    // Check if MongoDB is connected
    else if (mongoose.connection.readyState) {
      for (const courseFolder of courseFolders) {
        try {
          const courseCollection = mongoose.connection.collection(courseFolder);
          const videos = await courseCollection.find({}).toArray();
          
          // Sort videos by lesson number for consistent ordering
          const sortedVideos = [...videos].sort((a, b) => {
            const aNum = parseInt(a.title.match(/\d+/)) || 0;
            const bNum = parseInt(b.title.match(/\d+/)) || 0;
            return aNum - bNum;
          });

          courses.push({
            name: courseFolder,
            videos: sortedVideos
          });
        } catch (collectionErr) {
          console.error(`Error fetching videos for course ${courseFolder}:`, collectionErr);
          // Still add the course with empty videos array
          courses.push({
            name: courseFolder,
            videos: [],
            error: 'Could not load videos from database'
          });
        }
      }
    } else {
      // MongoDB not connected, just show course folders
      courses = courseFolders.map(folder => ({
        name: folder,
        videos: [],
        error: 'Database connection unavailable',
        offlineMode: true
      }));
    }

    res.render('dashboard', { courses, offlineMode: isOfflineMode });
  } catch (err) {
    console.error('Error fetching course data:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Import services
const videoService = require('./services/videoService');
const thumbnailGenerator = require('./services/thumbnailGenerator');

// Course route
app.get('/course/:courseName', async (req, res) => {
  try {
    const courseName = req.params.courseName;
    
    // Get videos from service (will use localStorage if MongoDB is not available)
    let videos = await videoService.getVideosForCourse(courseName);
    
    // If no videos found, try to initialize from filesystem
    if (!videos || videos.length === 0) {
      const videoDir = path.join(__dirname, 'public', 'videos');
      videos = await videoService.initializeVideosFromFilesystem(courseName, videoDir);
    }

    // Preprocess video URLs to include the basename
    const processedVideos = videos.map(video => ({
      ...video,
      basename: video.videoUrl ? path.basename(video.videoUrl) : null
    }));

    // Calculate watched videos stats
    const totalVideos = videos.length;
    const watchedVideos = videos.filter(v => v.watched).length;
    
    // Find PDF files in the course directory
    const pdfFiles = [];
    const courseDir = path.join(__dirname, 'public', 'videos', courseName);
    const codeDir = path.join(courseDir, '[TutsNode.com] - DevOps Bootcamp', 'code');
    
    // Check if code directory exists
    if (fs.existsSync(codeDir)) {
      // Function to recursively find PDF files
      const findPdfs = (dir) => {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          
          if (stat.isDirectory()) {
            findPdfs(filePath);
          } else if (file.toLowerCase().endsWith('.pdf')) {
            // Extract number from filename for sorting
            const numberMatch = file.match(/\d+/);
            const fileNumber = numberMatch ? parseInt(numberMatch[0]) : 0;
            
            // Create relative path for serving
            const relativePath = path.relative(path.join(__dirname, 'public', 'videos'), filePath);
            pdfFiles.push({
              name: file,
              path: relativePath,
              number: fileNumber
            });
          }
        });
      };
      
      try {
        findPdfs(codeDir);
        // Sort PDFs by number
        pdfFiles.sort((a, b) => a.number - b.number);
      } catch (err) {
        console.error('Error finding PDF files:', err);
      }
    }

    // Calculate watched percentage for progress bar
    const watchedPercent = totalVideos > 0 ? Math.round((watchedVideos / totalVideos) * 100) : 0;
    
    res.render('course', { 
      courseName, 
      videos: processedVideos,
      pdfs: pdfFiles,
      totalVideos,
      watchedVideos,
      watchedPercent
    });
  } catch (err) {
    console.error('Error fetching course data:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Route to serve video files dynamically
app.get('/videos/:courseName/:id', async (req, res) => {
  try {
    const { courseName, id } = req.params;
    const ObjectId = require('mongoose').Types.ObjectId;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send('Invalid video ID');
    }

    // Get video from service (will use localStorage if MongoDB is not available)
    const video = await videoService.getVideoById(courseName, id);

    if (!video || !video.videoUrl) {
      return res.status(404).send('Video not found');
    }

    const videoPath = path.join(__dirname, 'public', 'videos', video.videoUrl);
    console.log("Serving video from:", videoPath);

    if (!fs.existsSync(videoPath)) {
      return res.status(404).send('Video file not found on disk');
    }

    // Get course stats for progress bar
    const allVideos = await videoService.getVideosForCourse(courseName);
    const totalVideos = allVideos.length;
    const watchedVideos = allVideos.filter(v => v.watched).length;
    const watchedPercent = totalVideos > 0 ? Math.round((watchedVideos / totalVideos) * 100) : 0;
    
    // Find PDF files in the course directory
    const pdfFiles = [];
    const courseDir = path.join(__dirname, 'public', 'videos', courseName);
    const codeDir = path.join(courseDir, '[TutsNode.com] - DevOps Bootcamp', 'code');
    
    // Check if code directory exists
    if (fs.existsSync(codeDir)) {
      // Function to recursively find PDF files
      const findPdfs = (dir) => {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          
          if (stat.isDirectory()) {
            findPdfs(filePath);
          } else if (file.toLowerCase().endsWith('.pdf')) {
            // Extract number from filename for sorting
            const numberMatch = file.match(/\d+/);
            const fileNumber = numberMatch ? parseInt(numberMatch[0]) : 0;
            
            // Create relative path for serving
            const relativePath = path.relative(path.join(__dirname, 'public', 'videos'), filePath);
            pdfFiles.push({
              name: file,
              path: relativePath,
              number: fileNumber
            });
          }
        });
      };
      
      try {
        findPdfs(codeDir);
        // Sort PDFs by number
        pdfFiles.sort((a, b) => a.number - b.number);
      } catch (err) {
        console.error('Error finding PDF files:', err);
      }
    }
    
    // Sort videos to determine if this is the last video
    const sortedVideos = allVideos.sort((a, b) => {
      const aNum = parseInt(a.title.match(/\d+/)) || 0;
      const bNum = parseInt(b.title.match(/\d+/)) || 0;
      return aNum - bNum;
    });
    
    // Check if this is the first or last video
    const currentIndex = sortedVideos.findIndex(v => v._id.toString() === id);
    const isFirstVideo = currentIndex === 0;
    const isLastVideo = currentIndex === sortedVideos.length - 1;

    // Render the video view
    res.render('video', { 
      video, 
      courseName, 
      totalVideos,
      watchedVideos,
      watchedPercent,
      isFirstVideo,
      isLastVideo,
      pdfs: pdfFiles
    });
  } catch (err) {
    console.error('Error serving video:', err.stack);
    res.status(500).send('Internal Server Error');
  }
});

// Watch route - redirects to the video route
app.get('/watch/:videoUrl', async (req, res) => {
  try {
    const videoUrl = req.params.videoUrl;
    const courseName = req.query.courseName;
    
    if (!videoUrl || !courseName) {
      return res.status(400).send('Missing video URL or course name');
    }
    
    // Extract the video ID from the URL
    const urlParts = videoUrl.split('/');
    const videoId = urlParts[urlParts.length - 1];
    
    // Redirect to the video route
    res.redirect(`/videos/${courseName}/${videoId}`);
  } catch (err) {
    console.error('Error redirecting to video:', err.stack);
    res.status(500).send('Internal Server Error');
  }
});

// Route to serve the actual video file
app.get('/videos/:courseName/file/:id', async (req, res) => {
  try {
    const { courseName, id } = req.params;
    const ObjectId = require('mongoose').Types.ObjectId;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send('Invalid video ID');
    }

    // Get video from service (will use localStorage if MongoDB is not available)
    const video = await videoService.getVideoById(courseName, id);

    if (!video || !video.videoUrl) {
      return res.status(404).send('Video file  not found');
    }

    const videoPath = path.join(__dirname, 'public', 'videos', video.videoUrl);
    console.log("Streaming video from:", videoPath);

    if (!fs.existsSync(videoPath)) {
      return res.status(404).send('Video file not found on disk');
    }

    // Stream the video file
    res.sendFile(videoPath);
  } catch (err) {
    console.error('Error streaming video:', err.stack);
    res.status(500).send('Internal Server Error');
  }
});


// Route to serve PDF files dynamically
// Instead of splitting manually, just use the full path
app.get('/pdf/*', (req, res) => {
  const pdfPath = req.params[0]; // gets full path after /pdf/
  const fullPath = path.join(__dirname, 'public', 'videos', pdfPath);

  // Check and serve
  fs.access(fullPath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error('PDF not found:', fullPath);
      return res.status(404).send('PDF not found');
    }

    res.sendFile(fullPath);
  });
});

app.post('/api/mark-watched', async (req, res) => {
  const { videoId, courseName } = req.body;

  try {
    console.log("Marking video as watched:", { videoId, courseName });

    if (!ObjectId.isValid(videoId)) {
      console.error("Invalid video ID:", videoId);
      return res.status(400).json({ error: "Invalid video ID" });
    }

    // Mark video as watched using the service
    // This will update both MongoDB (if connected) and localStorage
    const success = await videoService.markVideoAsWatched(courseName, videoId);
    
    if (!success) {
      return res.status(404).json({ error: "Video not found" });
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error marking video as watched:", err);
    res.status(500).json({ error: "Failed to mark video as watched" });
  }
});

app.get('/api/next-video', async (req, res) => {
  const { currentVideoId, courseName, direction } = req.query;
  const isPrev = direction === 'prev';

  try {
    console.log(`Fetching ${isPrev ? 'previous' : 'next'} video for:`, { currentVideoId, courseName });

    if (!ObjectId.isValid(currentVideoId)) {
      console.error("Invalid current video ID:", currentVideoId);
      return res.status(400).json({ error: "Invalid current video ID" });
    }

    // Get videos from service (will use localStorage if MongoDB is not available)
    const videos = await videoService.getVideosForCourse(courseName);
    
    // Sort videos by lesson number in title
    const sortedVideos = videos.sort((a, b) => {
      const aNum = parseInt(a.title.match(/\d+/)) || 0;
      const bNum = parseInt(b.title.match(/\d+/)) || 0;
      return aNum - bNum;
    });

    // Find the index of the current video in the sorted array
    const currentIndex = sortedVideos.findIndex(
      (video) => video._id.toString() === currentVideoId
    );

    if (currentIndex === -1) {
      console.log("Current video not found in course.");
      return res.status(404).json({ error: "Current video not found in course" });
    }

    // Check if we're at the beginning or end
    if (isPrev && currentIndex === 0) {
      console.log("No previous video available.");
      return res.status(404).json({ error: "No previous video available" });
    }
    
    if (!isPrev && currentIndex === sortedVideos.length - 1) {
      console.log("No next video available.");
      return res.status(404).json({ error: "No next video available" });
    }

    // Return the next or previous video
    const adjacentVideo = sortedVideos[isPrev ? currentIndex - 1 : currentIndex + 1];
    console.log(`${isPrev ? 'Previous' : 'Next'} video found:`, adjacentVideo);
    
    res.status(200).json({
      ...adjacentVideo,
      _id: adjacentVideo._id.toString()
    });
  } catch (err) {
    console.error(`Error fetching ${isPrev ? 'previous' : 'next'} video: `, err);
    res.status(500).json({ error: `Failed to fetch ${isPrev ? 'previous' : 'next'} video` });
  }
});

// Simple ping endpoint for connection detection
app.head('/api/ping', (req, res) => {
  // If MongoDB is connected, return 200, otherwise 503
  if (mongoose.connection.readyState) {
    res.status(200).end();
  } else {
    res.status(503).end();
  }
});

// API endpoint to check connection status
app.get('/api/connection-status', (req, res) => {
  res.json({
    online: !isOfflineMode,
    mongoConnected: mongoose.connection.readyState === 1
  });
});

// API endpoint to force sync a specific video
app.post('/api/force-sync-video', async (req, res) => {
  try {
    const { courseName, videoTitle } = req.body;
    
    if (!courseName || !videoTitle) {
      return res.status(400).json({ error: 'Missing courseName or videoTitle', success: false });
    }
    
    console.log(`Force syncing video ${videoTitle} in course ${courseName}...`);
    
    // Force a reconnection attempt if not connected
    if (!mongoose.connection.readyState) {
      try {
        await connectToMongoDB();
      } catch (connErr) {
        return res.status(503).json({ error: 'Could not connect to MongoDB', success: false });
      }
    }
    
    // Get the video from localStorage
    const localStorage = videoService.getLocalStorage();
    if (!localStorage[courseName]) {
      return res.status(404).json({ error: `Course ${courseName} not found in localStorage`, success: false });
    }
    
    const localVideo = localStorage[courseName].find(v => v.title === videoTitle);
    if (!localVideo) {
      return res.status(404).json({ error: `Video ${videoTitle} not found in localStorage for course ${courseName}`, success: false });
    }
    
    // Get the video from MongoDB
    const courseCollection = mongoose.connection.collection(courseName);
    const dbVideo = await courseCollection.findOne({ title: videoTitle });
    
    if (!dbVideo) {
      return res.status(404).json({ error: `Video ${videoTitle} not found in MongoDB for course ${courseName}`, success: false });
    }
    
    // Update the video in MongoDB
    const result = await courseCollection.updateOne(
      { _id: dbVideo._id },
      { $set: { watched: localVideo.watched, watchedAt: localVideo.watchedAt } }
    );
    
    if (result.matchedCount > 0) {
      res.status(200).json({ success: true, message: `Successfully synced video ${videoTitle}` });
    } else {
      res.status(500).json({ error: `Failed to update video ${videoTitle} in MongoDB`, success: false });
    }
  } catch (err) {
    console.error('Error force syncing video:', err);
    res.status(500).json({ error: 'Error force syncing video: ' + err.message, success: false });
  }
});

// Sync route to sync localStorage with MongoDB
app.post('/api/sync', async (req, res) => {
  try {
    // Check if we're in offline mode
    if (isOfflineMode) {
      // Try to reconnect to MongoDB
      try {
        console.log('Attempting to reconnect to MongoDB...');
        await connectToMongoDB();
        
        // If still offline after reconnection attempt
        if (isOfflineMode) {
          return res.status(200).json({ 
            success: false, 
            offline: true,
            message: 'Currently in offline mode. Your progress is saved locally and will sync when online.' 
          });
        }
      } catch (connErr) {
        console.error('Failed to reconnect to MongoDB:', connErr);
        return res.status(200).json({ 
          success: false, 
          offline: true,
          message: 'Currently offline. Your progress is saved locally and will sync when online.' 
        });
      }
    }
    
    // Now try to sync
    const syncResult = await videoService.syncWithMongoDB();
    if (syncResult) {
      res.status(200).json({ success: true, message: 'Sync completed successfully' });
    } else {
      res.status(200).json({ 
        success: false, 
        offline: true,
        message: 'Currently in offline mode. Your progress is saved locally and will sync when online.' 
      });
    }
  } catch (err) {
    console.error('Error syncing with MongoDB:', err);
    res.status(200).json({ 
      success: false, 
      offline: true,
      error: err.message,
      message: 'Error occurred, but your progress is saved locally and will sync when online.' 
    });
  }
});

// Start server
app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  
  // Try to sync on startup
  if (!isOfflineMode && mongoose.connection.readyState) {
    videoService.syncWithMongoDB()
      .then(() => console.log('Synced localStorage with MongoDB'))
      .catch(err => console.error('Error syncing with MongoDB:', err));
  } else {
    console.log('Running in offline mode. Videos will be served from localStorage.');
  }
  
  // Set up periodic connection check
  setInterval(() => {
    if (isOfflineMode) {
      console.log('Checking if online connection is available...');
      connectToMongoDB()
        .then(() => {
          if (!isOfflineMode) {
            console.log('Reconnected to MongoDB! Syncing data...');
            return videoService.syncWithMongoDB();
          }
        })
        .catch(err => {
          // Still offline, continue in offline mode
        });
    }
  }, 60000); // Check every minute
});