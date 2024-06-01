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
      const files = fs.readdirSync(videoDir);
  
      const videoDocuments = files.map(file => ({
        title: path.basename(file, path.extname(file)), // Use filename without extension as title
        description: `Description for ${file}`, // Placeholder description
        videoUrl: file, // Just the filename
        watched: false,
        watchedAt: null // Default to null
      }));
  
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
  // View Engine
app.set('view engine', 'ejs');

// Routes

app.use('/videos', videoRoutes);


// Default Route to Home Page
app.get('/', (req, res) => {
    res.redirect('/videos');
   // addVideoFiles()
   // addDummyData()
  });

  // Start Server
app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });
   