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
mongoose.connect(config.mongodbUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('MongoDB connected');
    // Call addVideoFiles after successful connection
    addVideoFiles()
      .then(() => console.log('Video files added to MongoDB'))
      .catch(err => console.error('Error adding video files:', err));
  })
  .catch(error => {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  });

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

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
      throw new Error('MongoDB connection not established.');
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
        console.error(`Error traversing directory ${dir}:`, err);
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
    for (const courseFolder of courseFolders) {
      const courseCollection = mongoose.connection.collection(courseFolder);
      const videos = await courseCollection.find({}).toArray();

      courses.push({
        name: courseFolder,
        videos: videos
      });
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
    const courseCollection = mongoose.connection.collection(courseName);

    // Fetch videos for the course
    const videos = await courseCollection.find({}).toArray();

    // Preprocess video URLs to include the basename
    const processedVideos = videos.map(video => ({
      ...video,
      basename: video.videoUrl ? path.basename(video.videoUrl) : null
    }));

    res.render('course', { courseName, videos: processedVideos });
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

    const videoPath = path.join(__dirname, 'public', 'videos', video.videoUrl); // <-- ✅ FIXED HERE
    console.log("Serving video from:", videoPath);

    if (!fs.existsSync(videoPath)) {
      return res.status(404).send('Video file not found on disk');
    }

    res.sendFile(videoPath);
  } catch (err) {
    console.error('Error serving video:', err.stack);
    res.status(500).send('Internal Server Error');
  }
});


// Route to serve PDF files dynamically
app.get('/pdf/:courseName/*', (req, res) => {
  try {
    const { courseName } = req.params;
    const filePath = req.params[0]; // Capture the full path after /pdf/:courseName/
    const decodedFilePath = decodeURIComponent(filePath); // Decode special characters
    const pdfPath = path.join(__dirname, 'public', 'videos', courseName, decodedFilePath);

    if (!fs.existsSync(pdfPath)) {
      return res.status(404).send('PDF file not found');
    }

    res.sendFile(pdfPath);
  } catch (err) {
    console.error('Error serving PDF:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Start server
app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});
