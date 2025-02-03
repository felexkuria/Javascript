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
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('MongoDB connected');
})
.catch(error => { // Fixed error variable name
  console.error('Error connecting to MongoDB:', error);
  process.exit(1);
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));


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

    // Improved directory traversal with error handling
    const traverseDirectory = (dir, section) => {
      try {
        const files = fs.readdirSync(dir);
        let videoDocuments = [];

        files.forEach(file => {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);

          if (stat.isDirectory()) {
            videoDocuments = videoDocuments.concat(traverseDirectory(filePath, file));
          } else if (stat.isFile()) {
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

    const targetCollectionName = 'The Complete Node Bootcamp 2021';
    const targetCollection = mongoose.connection.collection(targetCollectionName);
    
    await targetCollection.deleteMany({});
    
    const videoDocuments = traverseDirectory(videoDir, null);
    if (videoDocuments.length > 0) {
      await targetCollection.insertMany(videoDocuments);
    }

    // Move existing data with error handling
    const oldCollection = mongoose.connection.collection('videos');
    const oldData = await oldCollection.find({}).toArray();
    if (oldData.length > 0) {
      await targetCollection.insertMany(oldData);
      await oldCollection.deleteMany({});
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

// Start server
app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});
