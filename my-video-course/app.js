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



const textIn = fs.readFileSync('./public/videos/The Complete Node Bootcamp 2021/[TutsNode.com] - Node.js, Express, MongoDB & More - The Complete Bootcamp 2021/02 Introduction to Node.js and NPM/006 Download-starter-project-from-GitHub.txt', 'utf-8')
console.log(textIn)
fs.writeFileSync('./public.txt', "This is Node js Writing")
//console.log(textOut)
// Connect to MongoDB
mongoose.connect(config.mongodbUri,
  {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => {
    //addDummyData();
    console.log('MongoDB connected');
    //addVideoFiles()
  })

  .catch(err => {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1); // Exit the application on connection failure
  }
  );

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));


const checkForCaptions = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.srt'; // Check for lowercase '.srt' extension
};

const addVideoFiles = async () => {
  try {
    if (!mongoose.connection.readyState) {
      console.error('MongoDB connection not established.');
      return;
    }

    const videoDir = path.join(__dirname, 'public', 'videos');

    const traverseDirectory = (dir, section) => {
      const files = fs.readdirSync(dir);
      let videoDocuments = [];

      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          videoDocuments = videoDocuments.concat(traverseDirectory(filePath, file));
        } else if (stat.isFile()) {
          const isCaption = checkForCaptions(filePath); // Ensure this function is defined elsewhere
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
    };

    const courseFolders = fs.readdirSync(videoDir).filter(folder => {
      return fs.statSync(path.join(videoDir, folder)).isDirectory();
    });

    for (const courseFolder of courseFolders) {
      const courseDir = path.join(videoDir, courseFolder);
      const videoDocuments = traverseDirectory(courseDir, null);

      const courseCollection = mongoose.connection.collection(courseFolder);
      await courseCollection.deleteMany({});
      console.log(`Cleared existing data for ${courseFolder}.`);

      await courseCollection.insertMany(videoDocuments);
      console.log(`Video files and captions inserted into ${courseFolder} collection.`);
    }

    mongoose.connection.close();
    console.log('Database connection closed.');
  } catch (err) {
    if (err.name === 'MongoNotConnectedError') {
      console.error('MongoDB connection not established.');
    } else {
      console.error('Error adding video files:', err);
    }
  }
};




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

// Endpoint to fetch and render videos, sections, and progress
app.get('/', (req, res) => {
  try {
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Error redirecting to dashboard:', err);
    res.status(500).send('Server Error');
  }
});


// Route to render the dashboard
app.get('/dashboard', async (req, res) => {
  try {
    const videoDir = path.join(__dirname, 'public', 'videos');
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

    res.render('dashboard', { courses: courses });
  } catch (err) {
    console.error('Error fetching course data:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Route to render sections and videos of a specific course
// Route to render sections and videos of a specific course
app.get('/course/:courseName', async (req, res) => {
  try {
    const courseName = req.params.courseName;
    const selectedSection = req.query.section || 'All Videos';
    const courseCollection = mongoose.connection.collection(courseName);
    const videos = await courseCollection.find({}).toArray();

    const sections = {};
    videos.forEach(video => {
      if (!sections[video.section]) {
        sections[video.section] = [];
      }
      sections[video.section].push(video);
    });

    const totalVideos = videos.length;
    const watchedVideos = videos.filter(video => video.watched).length;
    const watchedPercentage = (totalVideos === 0) ? 0 : (watchedVideos / totalVideos) * 100;

    res.render('section', {
      courseName,
      videos,
      sections,
      totalVideos,
      watchedVideos,
      watchedPercentage,
      selectedSection
    });
  } catch (err) {
    console.error('Error fetching course data:', err);
    res.status(500).send('Internal Server Error');
  }
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
  try {
    const video = await Video.findById(req.params.id);
    const allSections = await Video.distinct('section');
    const sections = {};
    for (const section of allSections) {
      sections[section] = await Video.find({ section });
    }
    res.render('video', { video, sections, captionsUrl: video.captionsUrl });
  } catch (error) {
    console.error('Error fetching video:', error);
    res.status(500).send('Server Error');
  }
});

app.post('/videos/:id/watch', async (req, res) => {
  await Video.findByIdAndUpdate(req.params.id, { watched: true, watchedAt: new Date() });
  res.redirect(`/videos/${req.params.id}`);
});
// Endpoint to mark video as watched
// app.post('/videos/:id/watch', async (req, res) => {
//   try {
//     const video = await Video.findById(req.params.id);
//     video.watched = true;
//     video.watchedAt = new Date();
//     await video.save();

//     const videos = await Video.find();
//     const totalVideos = videos.length;
//     const watchedVideos = videos.filter(video => video.watched).length;
//     const progress = (watchedVideos / totalVideos) * 100;
// // post data to  db
//     res.json({ success: true, progress, watchedVideos, totalVideos });
//   } catch (err) {
//     console.error('Error marking video as watched:', err);
//     res.status(500).send('Server Error');
//   }
// });


app.get('/section/:sectionName', async (req, res) => {
  try {
    const sectionName = req.params.sectionName;
    const videos = await Video.find({ section: sectionName });
    const allSections = await Video.distinct('section'); // Get all section names
    const sections = {};
    const totalVideos = videos.length;
    const watchedVideos = videos.filter(video => video.watched).length;

    allSections.forEach(section => {
      sections[section] = [];
    });

    videos.forEach(video => {
      sections[video.section].push(video);
    });

    res.render('section', {
      sectionName,
      videos,
      sections,
      totalVideos,
      watchedVideos
    });
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
