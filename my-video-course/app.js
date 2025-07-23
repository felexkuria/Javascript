// Import required modules
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const config = require('./config');
const videoRoutes = require('./routes/video');
const fs = require('fs');
const path = require('path');
const ObjectId = mongoose.Types.ObjectId;

// Initialize express app
const app = express();

// Import Video model
const Video = require('./models/Video');

// IMPROVEMENTS:
// - Add error handling middleware
// - Add request logging middleware
// - Add input validation
// - Add authentication/authorization
// - Use environment variables for configuration
// - Add API documentation
// - Add request rate limiting
// - Add security headers
// - Add compression middleware
// - Add clustering for better performance

// Connect to MongoDB with proper error handling
mongoose.connect(config.mongodbUri, { 
  // These options are deprecated and will be removed in future versions
  // useNewUrlParser: true, 
  // useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
  family: 4 // Use IPv4, skip trying IPv6
})
  .then(() => {
    console.log('MongoDB connected');
    // Call addVideoFiles after successful connection
    addVideoFiles()
      .then(() => console.log('Video files added to MongoDB'))
      .catch(err => console.error('Error adding video files:', err));
  })
  .catch(error => {
    console.error('Error connecting to MongoDB:', error);
    console.log('Please check your internet connection and MongoDB Atlas network access settings.');
    // Don't exit the process, let the app continue running so it can be restarted by nodemon
    // process.exit(1);
  });

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
    
    // Check if MongoDB is connected
    if (mongoose.connection.readyState) {
      for (const courseFolder of courseFolders) {
        try {
          const courseCollection = mongoose.connection.collection(courseFolder);
          const videos = await courseCollection.find({}).toArray();

          courses.push({
            name: courseFolder,
            videos: videos
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
        error: 'Database is connection unavailable'
      }));
    }

    res.render('dashboard', { courses });
  } catch (err) {
    console.error('Error fetching course data:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Course route
app.get('/course/:courseName', async (req, res) => {
  try {
    const courseName = req.params.courseName;
    
    // Check if MongoDB is connected
    if (!mongoose.connection.readyState) {
      return res.render('course', { 
        courseName, 
        videos: [],
        pdfs: [],
        error: 'Database connection unavailable'
      });
    }
    
    const courseCollection = mongoose.connection.collection(courseName);

    // Fetch all videos for the course
    const videos = await courseCollection.find({}).toArray();

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
            // Create relative path for serving
            const relativePath = path.relative(path.join(__dirname, 'public', 'videos'), filePath);
            pdfFiles.push({
              name: file,
              path: relativePath
            });
          }
        });
      };
      
      try {
        findPdfs(codeDir);
      } catch (err) {
        console.error('Error finding PDF files:', err);
      }
    }

    res.render('course', { 
      courseName, 
      videos: processedVideos,
      pdfs: pdfFiles,
      totalVideos,
      watchedVideos
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

    const video = await mongoose.connection.collection(courseName).findOne({ _id: new ObjectId(id) });

    if (!video || !video.videoUrl) {
      return res.status(404).send('Video not found');
    }

    const videoPath = path.join(__dirname, 'public', 'videos', video.videoUrl);
    console.log("Serving video from:", videoPath);

    if (!fs.existsSync(videoPath)) {
      return res.status(404).send('Video file not found on disk');
    }

    // Get course stats for progress bar
    const courseCollection = mongoose.connection.collection(courseName);
    const allVideos = await courseCollection.find({}).toArray();
    const totalVideos = allVideos.length;
    const watchedVideos = allVideos.filter(v => v.watched).length;
    const watchedPercent = totalVideos > 0 ? Math.round((watchedVideos / totalVideos) * 100) : 0;

    // Render the video view
    res.render('video', { 
      video, 
      courseName, 
      totalVideos,
      watchedVideos,
      watchedPercent
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
    console.error('Error redirecting to videos:', err.stack);
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

    const video = await mongoose.connection.collection(courseName).findOne({ _id: new ObjectId(id) });

    if (!video || !video.videoUrl) {
      return res.status(404).send('Video file not found');
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

    // Update directly in the course collection
    const result = await mongoose.connection.collection(courseName).updateOne(
      { _id: new ObjectId(videoId) },
      { $set: { watched: true, watchedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
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

    const courseCollection = mongoose.connection.collection(courseName);

    // Fetch all videos in the course
    const videos = await courseCollection.find({}).toArray();
    
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

// Start server
app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});


