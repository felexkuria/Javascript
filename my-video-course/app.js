const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const config = require('./config');
console.log('MongoDB URI:', config.mongodbUri || 'Not defined');
const videoRoutes = require('./routes/videoRoutes');
const ObjectId = mongoose.Types.ObjectId;
// .ics after travesring and adding video check video lenght  if video a and video b duratiion is 1 hour
const app = express();
const multer = require('multer');
const multerS3 = require('multer-s3');
const AWS = require('aws-sdk');
// Load environment variables
require('dotenv').config();
console.log('Environment loaded, S3 bucket:', process.env.S3_BUCKET_NAME);

// Set AWS SDK to load config from environment variables
process.env.AWS_SDK_LOAD_CONFIG = 1;

// Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

// Set up AWS S3 instance
const s3 = new AWS.S3();

// Ensure the public/videos directory exists 
const videoDir = path.join(__dirname, 'public', 'videos');

// Configure multer for file upload
let storage;

// Check if S3 credentials are available
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.S3_BUCKET_NAME) {
  console.log('Using S3 storage for uploads');
  storage = multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME,
    acl: 'public-read',
    key: function (req, file, cb) {
      cb(null, 'uploads/' + Date.now().toString() + '-' + file.originalname);
    }
  });
} else {
  console.log('Using local storage for uploads');
  // Create uploads directory if it doesn't exist
  const uploadsDir = path.join(__dirname, 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  
  // Use local disk storage
  storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + '-' + file.originalname);
    }
  });
}

const upload = multer({ storage: storage });

// Connect to MongoDB with offline fallback
let isOfflineMode = false;

const connectToMongoDB = () => {
  // Check if MongoDB URI is defined
  if (!config.mongodbUri) {
    console.error('MongoDB URI is not defined in config');
    console.log('Running in offline mode with localStorage');
    isOfflineMode = true;
    return Promise.resolve(false);
  }
  
  return mongoose.connect(config.mongodbUri, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    family: 4  // Force IPv4 instead of IPv6
  })
  .then(() => {
    console.log('Connected to MongoDB');
    isOfflineMode = false;
    return true;
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    console.log('Running in offline mode with localStorage');
    isOfflineMode = true;
    // Don't exit the process, continue in offline mode
    return false;
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
        if (!fs.existsSync(dir)) {
          console.warn(`Directory not found: ${dir}`);
          return [];
        } 
        // Log the directory being traversed
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

// Import video service
const videoService = require('./services/videoService');
const thumbnailGenerator = require('./services/thumbnailGenerator');

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

// Dashboard route
app.get('/dashboard', async (req, res) => {
  try {
    const videoDir = path.join(__dirname, 'public', 'videos');
    
    // Create videos directory if it doesn't exist
    if (!fs.existsSync(videoDir)) {
      fs.mkdirSync(videoDir, { recursive: true });
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
          const aNum = parseInt(a.title?.match(/\d+/)) || 0;
          const bNum = parseInt(b.title?.match(/\d+/)) || 0;
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
            const aNum = parseInt(a.title?.match(/\d+/)) || 0;
            const bNum = parseInt(b.title?.match(/\d+/)) || 0;
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

// Upload route
app.get('/upload', (req, res) => {
  try {
    // Log environment variables for debugging
    console.log('S3 Configuration:', {
      region: process.env.AWS_REGION,
      bucket: process.env.S3_BUCKET_NAME,
      identityPoolId: process.env.COGNITO_IDENTITY_POOL_ID
    });
    
    // Validate required environment variables
    if (!process.env.AWS_REGION || !process.env.S3_BUCKET_NAME || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.warn('Missing required S3 configuration. Direct upload will be used as fallback.');
    }
    
    // Add S3 configuration
    const s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION
    });

    // Get available courses for dropdown
    const videoDir = path.join(__dirname, 'public', 'videos');
    const courseFolders = fs.readdirSync(videoDir).filter(folder => {
      return fs.statSync(path.join(videoDir, folder)).isDirectory();
    });

    // Render the upload page with S3 bucket info and courses
    res.render('upload', {
      title: 'Upload Video',
      s3BucketName: process.env.S3_BUCKET_NAME || '',
      region: process.env.AWS_REGION || '',
      courses: courseFolders
    });
  } catch (err) {
    console.error('Error rendering upload page:', err);
    res.status(500).send('Server Error: ' + err.message);
  } 
});

// Handle file upload to S3
app.post('/videos/upload', async (req, res) => {
  try {
    const { title, description, courseId, videoUrl } = req.body;

    if (!videoUrl) {
      return res.status(400).json({ error: 'No video URL provided' });
    }

    // Create a new ObjectId for the video
    const videoId = new ObjectId();

    // Create video document
    const videoDoc = {
      _id: videoId,
      title,
      description,
      videoUrl,
      section: courseId,
      watched: false,
      watchedAt: null
    };

    // Save to MongoDB if connected
    if (mongoose.connection.readyState) {
      try {
        const courseCollection = mongoose.connection.collection(courseId);
        await courseCollection.insertOne(videoDoc);
        console.log(`Video saved to MongoDB: ${title}`);
      } catch (dbErr) {
        console.error('Error saving to MongoDB:', dbErr);
      }
    }

    // Save to localStorage as backup
    const localStorage = videoService.getLocalStorage();
    if (!localStorage[courseId]) {
      localStorage[courseId] = [];
    }
    localStorage[courseId].push(videoDoc);
    videoService.saveLocalStorage(localStorage);
    console.log(`Video saved to localStorage: ${title}`);

    // Generate thumbnail if possible
    try {
      // For S3 videos, we can't generate thumbnails directly
      // We would need to implement a separate process for this
      console.log('Thumbnail generation for S3 videos not implemented yet');
    } catch (thumbErr) {
      console.error('Error generating thumbnail:', thumbErr);
    }

    res.status(200).json({ success: true, redirectUrl: `/course/${courseId}` });
  } catch (err) {
    console.error('Error processing upload:', err);
    res.status(500).json({ error: 'Error processing upload' });
  }
});

// Direct file upload endpoint (fallback for when S3 is not available)
app.post('/videos/upload-direct', upload.single('video'), async (req, res) => {
  try {
    console.log('Direct upload request received:', req.body);
    const { title, description, courseId } = req.body;
    const videoFile = req.file;

    if (!videoFile) {
      console.error('No video file uploaded');
      return res.status(400).send('No video file uploaded');
    }

    console.log('File uploaded successfully:', videoFile);

    // Create video document
    const videoId = new ObjectId();
    
    // Determine the video URL based on storage type
    let videoUrl;
    if (videoFile.location) {
      // S3 upload
      videoUrl = videoFile.location;
    } else {
      // Local upload - create a relative URL
      videoUrl = '/uploads/' + videoFile.filename;
    }
    
    const videoDoc = {
      _id: videoId,
      title,
      description,
      videoUrl,
      section: courseId,
      watched: false,
      watchedAt: null
    };

    console.log('Video document created:', videoDoc);

    // Save to MongoDB if connected
    if (mongoose.connection.readyState) {
      try {
        const courseCollection = mongoose.connection.collection(courseId);
        await courseCollection.insertOne(videoDoc);
        console.log(`Video saved to MongoDB: ${title}`);
      } catch (dbErr) {
        console.error('Error saving to MongoDB:', dbErr);
      }
    }

    // Save to localStorage as backup
    const localStorage = videoService.getLocalStorage();
    if (!localStorage[courseId]) {
      localStorage[courseId] = [];
    }
    localStorage[courseId].push(videoDoc);
    videoService.saveLocalStorage(localStorage);
    console.log(`Video saved to localStorage: ${title}`);

    // Generate thumbnail if possible
    try {
      if (videoFile.path) {
        const thumbnailUrl = await thumbnailGenerator.generateThumbnail(videoFile.path, videoId);
        console.log('Thumbnail generated:', thumbnailUrl);
      }
    } catch (thumbErr) {
      console.error('Error generating thumbnail:', thumbErr);
    }

    res.redirect(`/course/${courseId}`);
  } catch (err) {
    console.error('Error uploading file:', err);
    res.status(500).send('Error uploading file: ' + err.message);
  }
});

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
 
//add code to get http://localhost:3000/profile 
app.get('/profile', (req, res) => {
  res.render('profile');
});
// Add code to get http://localhost:3000/settings
app.get('/settings', (req, res) => {
  res.render('settings');
});
// Start server
app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  
  // Try to sync on startup
  if (config.mongodbUri && !isOfflineMode && mongoose.connection.readyState) {
    videoService.syncWithMongoDB()
      .then(() => console.log('Synced localStorage with MongoDB'))
      .catch(err => console.error('Error syncing with MongoDB:', err));
  } else {
    console.log('Running in offline mode. Videos will be served from localStorage.');
  }
  
  // Set up periodic connection check
  setInterval(() => {
    if (isOfflineMode && config.mongodbUri) {
      console.log('Checking if online connection is available...');
      connectToMongoDB()
        .then((connected) => {
          if (connected) {
            console.log('Reconnected to MongoDB! Syncing data...');
            return videoService.syncWithMongoDB();
          } else {
            console.log('Still offline, continuing in offline mode');
          }
        })
        .catch(err => {
          console.error('Error during connection check:', err);
          // Still offline, continue in offline mode
        });
    }
  }, 60000); // Check every minute
});