// const express = require('express');
// const mongoose = require('mongoose');
// const bodyParser = require('body-parser');
// const config = require('./config');
// const videoRoutes = require('./routes/video');

// const app = express();

// // Connect to MongoDB
// mongoose.connect(config.mongodbUri, { useNewUrlParser: true, useUnifiedTopology: true })
//   .then(() => console.log('MongoDB connected'))
//   .catch(err => console.log(err));

// // Middleware
// app.use(bodyParser.urlencoded({ extended: true }));
// app.use(express.static('public'));

// // View Engine
// app.set('view engine', 'ejs');


// // Routes
// app.use('/videos', videoRoutes);

// // Start Server
// app.listen(config.port, () => {
//   console.log(`Server running on port ${config.port}`);
// });
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const config = require('./config');
const videoRoutes = require('./routes/video');
const fs = require('fs');
const path = require('path');

const app = express();
// const mongoose = require('mongoose');
const Video = require('./models/Video'); // Ensure the path is correct




// Connect to MongoDB
mongoose.connect(config.mongodbUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    //addDummyData();
    console.log('MongoDB connected');
    //addVideoFiles()
})

  .catch(err => console.log(err));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));


const addVideoFiles = async () => {
  try {
    const videoDir = path.join(__dirname, 'public', 'videos');

    const traverseDirectory = (dir, section) => {
      const files = fs.readdirSync(dir);
      let videoDocuments = [];

      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          // Recursively traverse subdirectories
          videoDocuments = videoDocuments.concat(traverseDirectory(filePath, file));
        } else if (stat.isFile()) {
          videoDocuments.push({
            title: path.basename(file, path.extname(file)), // Use filename without extension as title
            description: `Description for ${file}`, // Placeholder description
            videoUrl: path.relative(videoDir, filePath), // Relative path from videoDir
            section: section,
            watched: false,
            watchedAt: null // Default to null
          });
        }
      });

      return videoDocuments;
    };

    // Traverse the main video directory
    const videoDocuments = traverseDirectory(videoDir, null);

    // Clear the collection before inserting new data
    await Video.deleteMany({});
    console.log('Cleared existing data.');

    // Insert video documents
    await Video.insertMany(videoDocuments);
    console.log('Video files inserted into MongoDB.');

    // Close the database connection
    mongoose.connection.close();
    console.log('Database connection closed.');
  } catch (err) {
    console.error('Error adding video files:', err);
  }
};

// const addVideoFiles = async () => {
//     try {
//       const videoDir = path.join(__dirname, 'public', 'videos');
//       const files = fs.readdirSync(videoDir);
  
//       const videoDocuments = files.map(file => ({
//         title: path.basename(file, path.extname(file)), // Use filename without extension as title
//         description: `Description for ${file}`, // Placeholder description
//         videoUrl: file, // Just the filename
//         watched: false,
//         watchedAt: null // Default to null
//       }));
  
//       // Clear the collection before inserting new data
//       await Video.deleteMany({});
//       console.log('Cleared existing data.');
  
//       // Insert video documents
//       await Video.insertMany(videoDocuments);
//       console.log('Video files inserted into MongoDB.');
  
//       // Close the database connection
//       mongoose.connection.close();
//       console.log('Database connection closed.');
//     } catch (err) {
//       console.error('Error adding video files:', err);
//     }
//   };
  // View Engine
app.set('view engine', 'ejs');

// Routes

app.use('/videos', videoRoutes);


// Default Route to Home Page
app.set('view engine', 'ejs');
app.use(express.static('public'));

app.get('/', async (req, res) => {
  const allSections = await Video.distinct('section');
  const sections = {};
  for (const section of allSections) {
    sections[section] = await Video.find({ section });
  }
  res.render('index', { sections });
});

// app.get('/section/:sectionName', async (req, res) => {
//   const sectionName = req.params.sectionName;
//   const videos = await Video.find({ section: sectionName });
//   const allSections = await Video.distinct('section');
//   const sections = {};
//   for (const section of allSections) {
//     sections[section] = await Video.find({ section });
//   }
//   res.render('section', { sectionName, videos, sections });
// });
app.get('/videos/:id', async (req, res) => {
  const video = await Video.findById(req.params.id);
  const allSections = await Video.distinct('section');
  const sections = {};
  for (const section of allSections) {
    sections[section] = await Video.find({ section });
  }
  res.render('video', { video, sections });
});
app.post('/videos/:id/watch', async (req, res) => {
  await Video.findByIdAndUpdate(req.params.id, { watched: true, watchedAt: new Date() });
  res.redirect(`/videos/${req.params.id}`);
});

app.get('/section/:sectionName', async (req, res) => {
  try {
    const sectionName = req.params.sectionName;
    const videos = await Video.find({ section: sectionName });
    const allSections = await Video.distinct('section'); // Get all section names
    const sections = {};

    allSections.forEach(section => {
      sections[section] = [];
    });

    videos.forEach(video => {
      sections[video.section].push(video);
    });

    res.render('section', { sectionName, videos, sections });
  } catch (err) {
    res.status(500).send(err);
  }
});

// app.get('/', (req, res) => {
//     res.redirect('/videos');
//    // addVideoFiles()
//    // addDummyData()
//   });

  // Start Server
app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });
   