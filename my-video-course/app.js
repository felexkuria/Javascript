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

    const traverseDirectory = (dir, section, chapter = null) => {
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
            // Pass current directory name as chapter when recursing
            videoDocuments = videoDocuments.concat(traverseDirectory(filePath, section, file));
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
              chapter: chapter, // Add chapter info to document
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

        // Sync to localStorage
        const localStorage = videoService.getLocalStorage();
        localStorage[courseFolder] = videoDocuments;
        videoService.saveLocalStorage(localStorage);
        console.log(`Synced ${videoDocuments.length} videos to localStorage for ${courseFolder}`);

        // Generate thumbnails for each video
        for (const video of videoDocuments) {
          try {
            const videoPath = path.join(videoDir, video.videoUrl);
            const videoName = path.basename(videoPath, path.extname(videoPath));
            const thumbnailFilename = `${video._id}_${videoName}.jpg`;
            const thumbnailPath = path.join(__dirname, 'public', 'thumbnails', thumbnailFilename);

            // Check if thumbnail already exists
            if (fs.existsSync(thumbnailPath)) {
              console.log(`Thumbnail already exists for video ${video.title}: /thumbnails/${thumbnailFilename}`);
              const thumbnailUrl = `/thumbnails/${thumbnailFilename}`;
              await courseCollection.updateOne(
                { _id: video._id },
                { $set: { thumbnailUrl: thumbnailUrl } }
              );

              // Update localStorage
              const localStorage = videoService.getLocalStorage();
              const videoIndex = localStorage[courseFolder].findIndex(v => v._id.toString() === video._id.toString());
              if (videoIndex >= 0) {
                localStorage[courseFolder][videoIndex].thumbnailUrl = thumbnailUrl;
                videoService.saveLocalStorage(localStorage);
              }
            } else {
              const thumbnailUrl = await thumbnailGenerator.generateThumbnail(videoPath, video._id);
              if (thumbnailUrl) {
                console.log(`Generated thumbnail for video ${video.title}: ${thumbnailUrl}`);
                await courseCollection.updateOne(
                  { _id: video._id },
                  { $set: { thumbnailUrl: thumbnailUrl } }
                );

                // Update localStorage
                const localStorage = videoService.getLocalStorage();
                const videoIndex = localStorage[courseFolder].findIndex(v => v._id.toString() === video._id.toString());
                if (videoIndex >= 0) {
                  localStorage[courseFolder][videoIndex].thumbnailUrl = thumbnailUrl;
                  videoService.saveLocalStorage(localStorage);
                }
              }
            }
          } catch (thumbErr) {
            console.error(`Error generating thumbnail for video ${video.title}:`, thumbErr);
          }
        }
      } else {
        console.log(`No videos found for course: ${courseFolder}`);
      }
    }
  } catch (err) {
    console.error('Error in addVideoFiles:', err);
    throw err;
  }
};

//  addVideoFiles();
// Import video service
const videoService = require('./services/videoService');
const thumbnailGenerator = require('./services/thumbnailGenerator');
const videoManager = require('./services/videoManager');
const gamificationManager = require('./services/gamificationManager');

// View engine setup 
app.set('view engine', 'ejs');


// Routes

// Course video route
app.get('/course/:courseName/video/:videoId?', async (req, res) => {
  try {
    const courseName = decodeURIComponent(req.params.courseName);
    const videoId = req.params.videoId;
    const autoplay = req.query.autoplay === 'true';

    // Get all videos for the course
    let videos = await videoService.getVideosForCourse(courseName);

    if (!videos || videos.length === 0) {
      return res.status(404).render('error', { message: 'Course not found or has no videos' });
    }

    // Normalize lesson titles for consistency
    videos.forEach(video => {
      if (video.title) {
        // Extract lesson number if it exists
        const match = video.title.match(/(?:lesson|lession|leson)\s*(\d+)/i);
        if (match) {
          // Standardize to "Lesson X" format but keep original title for watched videos
          const lessonNum = match[1];
          video.displayTitle = `${video.title} (Lesson ${lessonNum})`;
        } else {
          video.displayTitle = video.title;
        }
      } else {
        video.displayTitle = 'Untitled Video';
      }
    });

    // Group videos by chapter and sort within each chapter
    const videosByChapter = {};
    videos.forEach(video => {
      const chapter = video.chapter || 'Uncategorized';
      if (!videosByChapter[chapter]) {
        videosByChapter[chapter] = [];
      }
      videosByChapter[chapter].push(video);
    });

    // Sort videos within each chapter by lesson number
    Object.keys(videosByChapter).forEach(chapter => {
      videosByChapter[chapter].sort((a, b) => {
        const aMatch = a.title ? a.title.match(/\d+/) : null;
        const bMatch = b.title ? b.title.match(/\d+/) : null;
        const aNum = aMatch ? parseInt(aMatch[0], 10) : 0;
        const bNum = bMatch ? parseInt(bMatch[0], 10) : 0;
        return aNum - bNum;
      });
    });

    // Sort videos by lesson number with proper handling of double-digit numbers
    videos = videos.sort((a, b) => {
      // First sort by chapter if different
      if (a.chapter !== b.chapter) {
        // If one has a chapter and the other doesn't, prioritize the one with chapter
        if (!a.chapter) return 1;
        if (!b.chapter) return -1;

        // Extract chapter numbers for proper sorting
        const aChapterMatch = a.chapter.match(/\d+/);
        const bChapterMatch = b.chapter.match(/\d+/);
        const aChapterNum = aChapterMatch ? parseInt(aChapterMatch[0], 10) : 0;
        const bChapterNum = bChapterMatch ? parseInt(bChapterMatch[0], 10) : 0;

        if (aChapterNum !== bChapterNum) {
          return aChapterNum - bChapterNum;
        }
        return a.chapter.localeCompare(b.chapter);
      }

      // Extract numbers from titles
      const aMatch = a.title ? a.title.match(/\d+/) : null;
      const bMatch = b.title ? b.title.match(/\d+/) : null;

      // Convert to numbers and ensure proper comparison
      const aNum = aMatch ? parseInt(aMatch[0], 10) : 0;
      const bNum = bMatch ? parseInt(bMatch[0], 10) : 0;

      // If numbers are the same, sort alphabetically
      if (aNum === bNum) {
        return a.title.localeCompare(b.title);
      }

      return aNum - bNum;
    });

    // Add chapter information to the template context
    const chapters = Object.keys(videosByChapter).sort();

    // If no videoId is provided, show the first video
    let video;
    let videoIndex = 0;

    if (videoId) {
      // Find the video by ID
      video = videos.find(v => v._id.toString() === videoId);
      videoIndex = videos.findIndex(v => v._id.toString() === videoId);

      if (!video) {
        return res.status(404).render('error', { message: 'Video not found' });
      }
    } else {
      // Show the first video
      video = videos[0];
    }

    // Don't require videoUrl for watched videos
    // Allow watched videos to be displayed even without a URL

    // Create full video URL path
    video.fullVideoUrl = `/videos/${courseName}/file/${video._id}`;

    // Calculate watched stats
    const watchedVideos = videos.filter(v => v.watched).length;
    const totalVideos = videos.length;
    const watchedPercent = Math.round((watchedVideos / totalVideos) * 100);

    // Determine if this is the first or last video
    const isFirstVideo = videoIndex === 0;
    const isLastVideo = videoIndex === videos.length - 1;

    // Get IDs for previous and next videos
    const prevVideoId = !isFirstVideo ? videos[videoIndex - 1]._id.toString() : null;
    const nextVideoId = !isLastVideo ? videos[videoIndex + 1]._id.toString() : null;

    // Check if this is the last video in a chapter
    let isLastInChapter = false;
    if (!isLastVideo && video.chapter) {
      const nextVideo = videos[videoIndex + 1];
      isLastInChapter = !nextVideo.chapter || nextVideo.chapter !== video.chapter;
    } else if (isLastVideo && video.chapter) {
      isLastInChapter = true;
    }

    // Get PDF resources if any
    const pdfs = [];

    res.render('video', {
      video,
      courseName,
      videos,
      watchedVideos,
      totalVideos,
      watchedPercent,
      isFirstVideo,
      isLastVideo,
      isLastInChapter,
      prevVideoId,
      nextVideoId,
      pdfs,
      autoplay,
      chapters,
      videosByChapter
    });
  } catch (err) {
    console.error('Error rendering video page:', err);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// API route for marking videos as watched
app.post('/api/videos/:videoId/watch', async (req, res) => {
  try {
    const videoId = req.params.videoId;
    const courseName = req.body.courseName || req.query.courseName;

    if (!videoId || !courseName) {
      return res.status(400).json({ success: false, message: 'Video ID and course name are required' });
    }

    const result = await videoService.markVideoAsWatched(courseName, videoId);

    if (result) {
      return res.json({ success: true, message: 'Video marked as watched' });
    } else {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
  } catch (error) {
    console.error('Error marking video as watched:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

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
          // First sort by chapter if different
          if (a.chapter !== b.chapter) {
            if (!a.chapter) return 1;
            if (!b.chapter) return -1;

            // Extract chapter numbers for proper sorting
            const aChapterMatch = a.chapter.match(/\d+/);
            const bChapterMatch = b.chapter.match(/\d+/);
            const aChapterNum = aChapterMatch ? parseInt(aChapterMatch[0], 10) : 0;
            const bChapterNum = bChapterMatch ? parseInt(bChapterMatch[0], 10) : 0;

            if (aChapterNum !== bChapterNum) {
              return aChapterNum - bChapterNum;
            }
            return a.chapter.localeCompare(b.chapter);
          }

          // Extract numbers and ensure proper parsing of double-digit numbers
          const aMatch = a.title?.match(/\d+/);
          const bMatch = b.title?.match(/\d+/);
          const aNum = aMatch ? parseInt(aMatch[0], 10) : 0;
          const bNum = bMatch ? parseInt(bMatch[0], 10) : 0;

          // If numbers are the same, sort alphabetically
          if (aNum === bNum) {
            return a.title.localeCompare(b.title);
          }
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
            // Extract numbers and ensure proper parsing of double-digit numbers
            const aMatch = a.title?.match(/\d+/);
            const bMatch = b.title?.match(/\d+/);
            const aNum = aMatch ? parseInt(aMatch[0], 10) : 0;
            const bNum = bMatch ? parseInt(bMatch[0], 10) : 0;
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

    // Log AWS configuration
    console.log('AWS Configuration:', {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ? '****' : undefined,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ? '****' : undefined,
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

// Configure multer for multiple file uploads
const multiUpload = multer({ storage: storage }).fields([
  { name: 'video', maxCount: 1 },
  { name: 'captions', maxCount: 1 }
]);

// Direct file upload endpoint (fallback for when S3 is not available)
app.post('/videos/upload-direct', multiUpload, async (req, res) => {
  try {
    console.log('Direct upload request received:', req.body);
    const { title, description, courseId } = req.body;
    const videoFile = req.files?.video?.[0];
    const captionsFile = req.files?.captions?.[0];

    if (!videoFile) {
      console.error('No video file uploaded');
      return res.status(400).send('No video file uploaded');
    }

    console.log('Files uploaded:', {
      video: videoFile?.filename,
      captions: captionsFile?.filename
    });

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
    const courseName = decodeURIComponent(req.params.courseName);
    console.log(`Accessing course: ${courseName}`);

    // Get videos from service (will use localStorage if MongoDB is not available)
    let videos = await videoService.getVideosForCourse(courseName);
    console.log(`Found ${videos ? videos.length : 0} videos for course ${courseName}`);

    // If no videos found, try to initialize from filesystem
    if (!videos || videos.length === 0) {
      const videoDir = path.join(__dirname, 'public', 'videos');
      videos = await videoService.initializeVideosFromFilesystem(courseName, videoDir);
      console.log(`Initialized ${videos ? videos.length : 0} videos from filesystem for course ${courseName}`);
    }

    // Ensure videos is an array
    if (!Array.isArray(videos)) {
      videos = [];
    }

    // Preprocess video URLs to include the basename
    const processedVideos = videos.map(video => {
      if (!video) return null;
      return {
        ...video,
        basename: video.videoUrl ? path.basename(video.videoUrl) : null,
        watched: video.watched || false // Ensure watched property exists
      };
    }).filter(video => video !== null); // Remove any null entries

    // Calculate watched videos stats
    const totalVideos = videos.length;
    const watchedVideos = videos.filter(v => v && v.watched).length;
    console.log(`Course ${courseName}: ${watchedVideos}/${totalVideos} videos watched`);

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
    console.log(`Course ${courseName}: Progress ${watchedPercent}%`);

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

// Route to handle course videos listing
app.get('/videos/:courseName', async (req, res) => {
  try {
    // Handle URL-encoded course names
    const courseName = decodeURIComponent(req.params.courseName);

    // Redirect to the course page - re-encode for the redirect
    res.redirect(`/course/${encodeURIComponent(courseName)}`);
  } catch (err) {
    console.error('Error redirecting to course page:', err);
    res.status(500).render('error', { message: 'Server error' });
  }
});

// Route to serve video files dynamically
app.get('/videos/:courseName/:id', async (req, res) => {
  try {
    // Handle URL-encoded course names
    let courseName = decodeURIComponent(req.params.courseName);
    const id = req.params.id;
    console.log(`Fetching video: ${courseName}/${id}`);

    // Handle double encoding issues
    try {
      courseName = decodeURIComponent(courseName);
    } catch (e) {
      // Already decoded
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.error(`Invalid ObjectId: ${id}`);
      return res.status(400).send('Invalid video ID');
    }

    // Get video from service (will use localStorage if MongoDB is not available)
    const video = await videoService.getVideoById(courseName, id);
    console.log('Video found:', video);

    if (!video) {
      console.error('Video not found');
      return res.status(404).send('Video not found');
    }

    // Continue even if video has no URL - we'll handle this in the video.ejs template

    // Log if video has no videoUrl but continue to render the page
    if (!video.videoUrl) {
      console.warn(`Video ${id} has no videoUrl property, but continuing to render page`);
    }

    // Check if video has a videoUrl property before using it
    if (!video.videoUrl) {
      console.warn(`Video ${id} has no videoUrl property`);
      // Skip file check and continue to render the page
    } else {
      const videoPath = path.join(__dirname, 'public', 'videos', video.videoUrl);
      console.log("Serving video from:", videoPath);

      if (!fs.existsSync(videoPath)) {
        console.warn(`Video file not found on disk: ${videoPath}`);
        // Don't return error, just log it and continue
      }
    }

    // Get course stats for progress bar
    const allVideos = await videoService.getVideosForCourse(courseName);
    const totalVideos = allVideos.length;
    const watchedVideos = allVideos.filter(v => v && v.watched).length;
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

    // Group videos by chapter and sort within each chapter
    const videosByChapter = {};
    allVideos.forEach(video => {
      const chapter = video.chapter || 'Uncategorized';
      if (!videosByChapter[chapter]) {
        videosByChapter[chapter] = [];
      }
      videosByChapter[chapter].push(video);
    });

    // Sort videos within each chapter by lesson number
    Object.keys(videosByChapter).forEach(chapter => {
      videosByChapter[chapter].sort((a, b) => {
        const aMatch = a.title ? a.title.match(/\d+/) : null;
        const bMatch = b.title ? b.title.match(/\d+/) : null;
        const aNum = aMatch ? parseInt(aMatch[0], 10) : 0;
        const bNum = bMatch ? parseInt(bMatch[0], 10) : 0;
        return aNum - bNum;
      });
    });

    // Sort videos to determine if this is the last video
    const sortedVideos = allVideos.sort((a, b) => {
      // First sort by chapter if different
      if (a.chapter !== b.chapter) {
        // If one has a chapter and the other doesn't, prioritize the one with chapter
        if (!a.chapter) return 1;
        if (!b.chapter) return -1;
        return a.chapter.localeCompare(b.chapter);
      }

      const aMatch = a.title ? a.title.match(/\d+/) : null;
      const bMatch = b.title ? b.title.match(/\d+/) : null;
      const aNum = aMatch ? parseInt(aMatch[0], 10) : 0;
      const bNum = bMatch ? parseInt(bMatch[0], 10) : 0;

      // Log sorting for debugging
      console.log(`Video order: ${a.title} (${aNum}) vs ${b.title} (${bNum})`);

      return aNum - bNum;
    });

    // Add chapter information
    const chapters = Object.keys(videosByChapter).sort();

    // Check if this is the first or last video
    const currentIndex = sortedVideos.findIndex(v => v && v._id && v._id.toString() === id);
    const isFirstVideo = currentIndex === 0;
    const isLastVideo = currentIndex === sortedVideos.length - 1;

    // Get previous and next video IDs
    const prevVideoId = currentIndex > 0 ? sortedVideos[currentIndex - 1]._id.toString() : null;
    const nextVideoId = currentIndex < sortedVideos.length - 1 ? sortedVideos[currentIndex + 1]._id.toString() : null;

    // Check if this is the last video in a chapter
    let isLastInChapter = false;
    if (!isLastVideo && video.chapter) {
      const nextVideo = sortedVideos[currentIndex + 1];
      isLastInChapter = !nextVideo.chapter || nextVideo.chapter !== video.chapter;
    } else if (isLastVideo && video.chapter) {
      isLastInChapter = true;
    }

    // Render the video view
    res.render('video', {
      video,
      courseName,
      totalVideos,
      watchedVideos,
      watchedPercent,
      isFirstVideo,
      isLastVideo,
      isLastInChapter,
      prevVideoId,
      nextVideoId,
      pdfs: pdfFiles,
      chapters,
      videosByChapter
    });
  } catch (err) {
    console.error('Error serving video:', err.stack);
    res.status(500).send('Internal Server Error');
  }
});

// Route to serve the actual video file
app.get('/videos/:courseName/file/:id', async (req, res) => {
  try {
    // Handle URL-encoded course names
    const courseName = decodeURIComponent(req.params.courseName);
    const id = req.params.id;
    console.log(`Streaming video file: ${courseName}/${id}`);

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.error(`Invalid ObjectId: ${id}`);
      return res.status(400).send('Invalid video ID');
    }

    // Get video from service (will use localStorage if MongoDB is not available)
    const video = await videoService.getVideoById(courseName, id);

    if (!video) {
      console.error('Video not found');
      return res.status(404).send('Video not found');
    }

    // Allow watched videos without URLs to be accessed
    if (!video.videoUrl) {
      console.warn(`Video ${id} has no URL but is being accessed`);
    }

    // Check if video has a URL
    if (!video.videoUrl) {
      console.warn(`Video ${id} has no URL, constructing from filesystem`);

      // Try to construct videoUrl from video title and course structure
      const videoDir = path.join(__dirname, 'public', 'videos', courseName);
      let foundVideoPath = null;

      const findVideoFile = (dir, targetTitle) => {
        if (!fs.existsSync(dir)) return null;
        const files = fs.readdirSync(dir);

        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);

          if (stat.isDirectory()) {
            const result = findVideoFile(filePath, targetTitle);
            if (result) return result;
          } else if (file.toLowerCase().endsWith('.mp4')) {
            const fileName = path.basename(file, path.extname(file));
            if (fileName.toLowerCase() === targetTitle.toLowerCase() ||
              fileName.toLowerCase().includes(targetTitle.toLowerCase())) {
              return path.relative(path.join(__dirname, 'public', 'videos'), filePath);
            }
          }
        }
        return null;
      };

      foundVideoPath = findVideoFile(videoDir, video.title);

      if (foundVideoPath) {
        console.log(`Found video file: ${foundVideoPath}`);
        // Update the video object and localStorage with the found path
        video.videoUrl = foundVideoPath;

        // Update localStorage
        const localStorage = videoService.getLocalStorage();
        if (localStorage[courseName]) {
          const videoIndex = localStorage[courseName].findIndex(v => v._id.toString() === id);
          if (videoIndex >= 0) {
            localStorage[courseName][videoIndex].videoUrl = foundVideoPath;
            videoService.saveLocalStorage(localStorage);
          }
        }
      } else {
        console.error(`Video file not found for: ${video.title}`);
        return res.status(404).send('Video file not available');
      }
    }

    // At this point video.videoUrl should exist (either original or found)
    const videoPath = path.join(__dirname, 'public', 'videos', video.videoUrl);
    console.log("Streaming video from:", videoPath);

    if (!fs.existsSync(videoPath)) {
      console.error(`Video file not found on disk: ${videoPath}`);
      return res.status(404).send('Video file not found on disk');
    }

    // Stream the video file
    res.sendFile(videoPath);

    // Start SRT generation in background if not exists and not already processing
    const videoName = path.basename(videoPath, path.extname(videoPath));
    const srtPath = path.join(path.dirname(videoPath), `${videoName}.srt`);

    if (!fs.existsSync(srtPath) && !srtGenerationProgress.has(videoName)) {
      console.log(`Starting background SRT generation for: ${videoName}`);
      srtGenerationProgress.set(videoName, { status: 'processing', progress: 0 });

      const srtQuizGenerator = require('./services/srtQuizGenerator');
      srtQuizGenerator.generateSRT(videoPath)
        .then(async (srtPath) => {
          console.log(`Background SRT generation completed for: ${videoName}`);
          srtGenerationProgress.set(videoName, { status: 'completed', progress: 100 });

          // Generate summary and topics after SRT completion
          try {
            const srtEntries = srtQuizGenerator.parseSRT(srtPath);
            if (srtEntries && srtEntries.length > 3) {
              const summaryData = await srtQuizGenerator.generateSummaryAndTopics(srtEntries, videoName);
              console.log(`Generated summary and topics for: ${videoName}`);

              // Store summary data
              const dataDir = path.join(__dirname, 'data');
              if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
              const summaryPath = path.join(dataDir, 'video_summaries.json');
              const summaries = fs.existsSync(summaryPath) ? JSON.parse(fs.readFileSync(summaryPath, 'utf8')) : {};
              summaries[videoName] = summaryData;
              fs.writeFileSync(summaryPath, JSON.stringify(summaries, null, 2));
            }
          } catch (summaryError) {
            console.warn(`Summary generation failed for ${videoName}:`, summaryError.message);
          }

          setTimeout(() => srtGenerationProgress.delete(videoName), 60000);
        })
        .catch(error => {
          console.warn(`Background SRT generation failed for ${videoName}:`, error.message);
          srtGenerationProgress.set(videoName, { status: 'failed', progress: 0 });
          setTimeout(() => srtGenerationProgress.delete(videoName), 60000);
        });
    } else if (srtGenerationProgress.has(videoName)) {
      const progress = srtGenerationProgress.get(videoName);
      console.log(`SRT generation for ${videoName} already ${progress.status} (${progress.progress}%)`);
    }
  } catch (err) {
    console.error('Error streaming video:', err.stack);
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

// Import caption converter utility
const captionConverter = require('./utils/captionConverter');

// Route to serve SRT subtitle files
app.get('/subtitles/:courseName/:videoTitle.srt', async (req, res) => {
  try {
    const courseName = decodeURIComponent(req.params.courseName);
    const videoTitle = decodeURIComponent(req.params.videoTitle);

    // Find SRT file in course directory
    const courseDir = path.join(__dirname, 'public', 'videos', courseName);
    let srtPath = null;

    const findSrt = (dir) => {
      if (!fs.existsSync(dir)) return null;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
          const result = findSrt(filePath);
          if (result) return result;
        } else if (file === `${videoTitle}.srt`) {
          return filePath;
        }
      }
      return null;
    };

    srtPath = findSrt(courseDir);

    if (srtPath && fs.existsSync(srtPath)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.sendFile(srtPath);
    } else {
      res.status(404).send('Subtitle file not found');
    }
  } catch (error) {
    console.error('Error serving subtitle:', error);
    res.status(500).send('Error serving subtitle');
  }
});

// Route to serve caption files
app.get('/captions/:courseName/:id', async (req, res) => {
  try {
    const courseName = decodeURIComponent(req.params.courseName);
    const id = req.params.id;
    console.log(`Fetching captions: ${courseName}/${id}`);

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.error(`Invalid ObjectId: ${id}`);
      return res.status(400).send('Invalid video ID');
    }

    // Get video from service
    const video = await videoService.getVideoById(courseName, id);

    if (!video) {
      console.error('Video not found');
      return res.status(404).send('Video not found');
    }

    // Check if video has captions
    if (!video.captionsUrl) {
      console.warn(`Video ${id} has no captions`);
      return res.status(404).send('No captions available for this video');
    }

    // Serve the caption file
    const captionPath = path.join(__dirname, 'public', 'videos', video.captionsUrl);
    console.log("Serving captions from:", captionPath);

    if (!fs.existsSync(captionPath)) {
      console.error(`Caption file not found on disk: ${captionPath}`);
      return res.status(404).send('Caption file not found');
    }

    // Check file extension
    const ext = path.extname(captionPath).toLowerCase();

    // Set the content type for WebVTT
    res.setHeader('Content-Type', 'text/vtt');

    if (ext === '.vtt') {
      // Serve WebVTT file directly
      res.sendFile(captionPath);
    } else if (ext === '.srt') {
      // Convert SRT to WebVTT
      fs.readFile(captionPath, 'utf8', (err, data) => {
        if (err) {
          console.error(`Error reading SRT file: ${captionPath}`, err);
          return res.status(500).send('Error reading caption file');
        }

        // Convert SRT to WebVTT
        const vttContent = captionConverter.srtToVtt(data);
        res.send(vttContent);
      });
    } else {
      console.error(`Unsupported caption format: ${ext}`);
      return res.status(400).send('Unsupported caption format');
    }
  } catch (err) {
    console.error('Error serving captions:', err.stack);
    res.status(500).send('Internal Server Error');
  }
});

// API endpoint for marking videos as watched
app.post('/api/mark-watched', async (req, res) => {
  const videoId = req.body.videoId;
  const courseName = req.body.courseName ? decodeURIComponent(req.body.courseName) : '';

  try {
    console.log("API: Marking video as watched:", { videoId, courseName });

    if (!videoId || !courseName) {
      console.error("Missing videoId or courseName:", { videoId, courseName });
      return res.status(400).json({ error: "Video ID and course name are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
      console.error("Invalid video ID:", videoId);
      return res.status(400).json({ error: "Invalid video ID" });
    }

    // Get the complete video data first
    const video = await videoService.getVideoById(courseName, videoId);
    if (!video) {
      console.error(`Video ${videoId} not found in course ${courseName}`);
      return res.status(404).json({ error: "Video not found" });
    }

    const watchedAt = new Date();

    // Update localStorage directly while preserving all properties
    const localStorage = videoService.getLocalStorage();
    if (!localStorage[courseName]) {
      localStorage[courseName] = [];
    }

    const videoIndex = localStorage[courseName].findIndex(v =>
      v && v._id && v._id.toString() === videoId.toString()
    );

    if (videoIndex >= 0) {
      // Update existing video while preserving all properties
      localStorage[courseName][videoIndex].watched = true;
      localStorage[courseName][videoIndex].watchedAt = watchedAt;
    } else {
      // Add complete video data
      localStorage[courseName].push({
        ...video,
        watched: true,
        watchedAt: watchedAt
      });
    }

    videoService.saveLocalStorage(localStorage);

    // Update MongoDB if connected
    if (mongoose.connection.readyState) {
      try {
        const courseCollection = mongoose.connection.collection(courseName);
        await courseCollection.updateOne(
          { _id: new ObjectId(videoId) },
          { $set: { watched: true, watchedAt: watchedAt } }
        );
      } catch (dbErr) {
        console.error('Error updating MongoDB:', dbErr);
      }
    }

    console.log(`Successfully marked video ${videoId} as watched in course ${courseName}`);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error marking video as watched:", err);
    res.status(500).json({ error: "Failed to mark video as watched" });
  }
});

app.get('/api/next-video', async (req, res) => {
  // Handle URL-encoded course names
  const currentVideoId = req.query.currentVideoId;
  const courseName = req.query.courseName ? decodeURIComponent(req.query.courseName) : '';
  const direction = req.query.direction;
  const isPrev = direction === 'prev';

  try {
    console.log(`Fetching ${isPrev ? 'previous' : 'next'} video for:`, { currentVideoId, courseName });

    if (!mongoose.Types.ObjectId.isValid(currentVideoId)) {
      console.error("Invalid current video ID:", currentVideoId);
      return res.status(400).json({ error: "Invalid current video ID" });
    }

    // Get videos from service (will use localStorage if MongoDB is not available)
    const videos = await videoService.getVideosForCourse(courseName);

    // Sort videos by lesson number in title with proper handling of double-digit numbers
    const sortedVideos = videos.sort((a, b) => {
      // First sort by chapter if different
      if (a.chapter !== b.chapter) {
        // If one has a chapter and the other doesn't, prioritize the one with chapter
        if (!a.chapter) return 1;
        if (!b.chapter) return -1;
        return a.chapter.localeCompare(b.chapter);
      }

      const aMatch = a.title.match(/\d+/);
      const bMatch = b.title.match(/\d+/);
      const aNum = aMatch ? parseInt(aMatch[0], 10) : 0;
      const bNum = bMatch ? parseInt(bMatch[0], 10) : 0;

      // Log sorting for debugging
      console.log(`API sorting: ${a.title} (${aNum}) vs ${b.title} (${bNum})`);

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

// API endpoint to check thumbnail existence and fix sync
app.get('/api/thumbnails/check/:videoId', (req, res) => {
  try {
    const videoId = req.params.videoId;
    const thumbnailsDir = path.join(__dirname, 'public', 'thumbnails');

    // Check for thumbnails with this video ID
    const thumbnailFiles = fs.readdirSync(thumbnailsDir)
      .filter(file => file.startsWith(videoId) && file.endsWith('.jpg'));

    if (thumbnailFiles.length > 0) {
      const thumbnailUrl = `/thumbnails/${thumbnailFiles[0]}`;
      res.json({ exists: true, thumbnailUrl });
    } else {
      res.json({ exists: false, thumbnailUrl: null });
    }
  } catch (error) {
    console.error('Error checking thumbnail:', error);
    res.status(500).json({ error: 'Failed to check thumbnail' });
  }
});

// API endpoint to generate thumbnails for a course
app.post('/api/thumbnails/generate/:courseName', async (req, res) => {
  try {
    const courseName = decodeURIComponent(req.params.courseName);
    const localStorage = videoService.getLocalStorage();
    const videos = localStorage[courseName] || [];

    let generatedCount = 0;
    let errorCount = 0;

    for (const video of videos) {
      if (video && video._id && video.videoUrl) {
        try {
          const videoPath = path.join(__dirname, 'public', 'videos', video.videoUrl);

          if (fs.existsSync(videoPath)) {
            const thumbnailUrl = await thumbnailGenerator.generateThumbnail(videoPath, video._id);

            if (thumbnailUrl && !video.thumbnailUrl) {
              video.thumbnailUrl = thumbnailUrl;
              generatedCount++;
            }
          }
        } catch (error) {
          console.error(`Error generating thumbnail for ${video.title}:`, error.message);
          errorCount++;
        }
      }
    }

    // Save updated localStorage
    localStorage[courseName] = videos;
    videoService.saveLocalStorage(localStorage);

    res.json({
      success: true,
      message: `Generated ${generatedCount} thumbnails for ${courseName}`,
      generatedCount,
      errorCount,
      totalVideos: videos.length
    });
  } catch (error) {
    console.error('Error generating thumbnails:', error);
    res.status(500).json({ error: 'Failed to generate thumbnails' });
  }
});

// API endpoint to fix thumbnails for a course
app.post('/api/thumbnails/fix/:courseName', async (req, res) => {
  try {
    const courseName = decodeURIComponent(req.params.courseName);
    const thumbnailsDir = path.join(__dirname, 'public', 'thumbnails');

    // Get all thumbnail files
    const thumbnailFiles = fs.readdirSync(thumbnailsDir).filter(file => file.endsWith('.jpg'));
    const thumbnailMap = {};
    thumbnailFiles.forEach(file => {
      const videoId = file.split('_')[0];
      thumbnailMap[videoId] = `/thumbnails/${file}`;
    });

    // Get videos from localStorage
    const localStorage = videoService.getLocalStorage();
    const videos = localStorage[courseName] || [];
    let fixedCount = 0;

    // Fix thumbnail URLs
    videos.forEach(video => {
      if (video && video._id) {
        const videoId = video._id.toString();
        if (thumbnailMap[videoId] && !video.thumbnailUrl) {
          video.thumbnailUrl = thumbnailMap[videoId];
          fixedCount++;
        }
      }
    });

    // Save updated localStorage
    localStorage[courseName] = videos;
    videoService.saveLocalStorage(localStorage);

    res.json({
      success: true,
      message: `Fixed ${fixedCount} thumbnail references for ${courseName}`,
      fixedCount
    });
  } catch (error) {
    console.error('Error fixing thumbnails:', error);
    res.status(500).json({ error: 'Failed to fix thumbnails' });
  }
});

// API endpoint to get localStorage video data
app.get('/api/videos/localStorage', (req, res) => {
  try {
    const localStorage = videoService.getLocalStorage();
    const { courseName } = req.query;

    if (courseName) {
      const courseData = localStorage[courseName] || [];
      res.json({ [courseName]: courseData, count: courseData.length });
    } else {
      // Return summary of all courses
      const summary = {};
      Object.keys(localStorage).forEach(course => {
        const videos = localStorage[course] || [];
        summary[course] = {
          totalVideos: videos.length,
          watchedVideos: videos.filter(v => v && v.watched).length,
          videos: videos
        };
      });
      res.json(summary);
    }
  } catch (error) {
    console.error('Error getting localStorage data:', error);
    res.status(500).json({ error: 'Failed to get localStorage data' });
  }
});

// Enhanced Gamification API endpoints
app.post('/api/gamification/sync', async (req, res) => {
  try {
    const { achievements, userStats, streakData } = req.body;
    const userId = 'default_user';

    const updates = {
      achievements: achievements || [],
      stats: userStats || {},
      streak: streakData?.currentStreak || 0
    };

    await gamificationManager.updateUserData(userId, updates);
    res.json({ success: true });
  } catch (error) {
    console.error('Error syncing gamification data:', error);
    res.status(500).json({ error: 'Failed to sync gamification data' });
  }
});

app.post('/api/gamification/video-watched', async (req, res) => {
  try {
    const { courseName, videoTitle, userId = 'default_user' } = req.body;
    const result = await gamificationManager.recordVideoWatch(userId, courseName, videoTitle);
    await gamificationManager.updateStreak(userId);
    res.json({ success: true, userData: result });
  } catch (error) {
    console.error('Error recording video watch:', error);
    res.status(500).json({ error: 'Failed to record video watch' });
  }
});

app.post('/api/gamification/quiz-completed', async (req, res) => {
  try {
    const { score, totalQuestions, userId = 'default_user' } = req.body;
    const result = await gamificationManager.recordQuizCompletion(userId, score, totalQuestions);
    res.json({ success: true, userData: result });
  } catch (error) {
    console.error('Error recording quiz completion:', error);
    res.status(500).json({ error: 'Failed to record quiz completion' });
  }
});

// API endpoint to get video watch dates for calendar
app.get('/api/videos/watch-dates', (req, res) => {
  try {
    const localStorage = videoService.getLocalStorage();
    const watchDates = [];

    Object.keys(localStorage).forEach(courseName => {
      const videos = localStorage[courseName] || [];
      videos.forEach(video => {
        if (video && video.watched && video.watchedAt) {
          watchDates.push({
            date: new Date(video.watchedAt).toISOString().split('T')[0],
            videoTitle: video.title,
            courseName: courseName
          });
        }
      });
    });

    res.json(watchDates);
  } catch (error) {
    console.error('Error getting watch dates:', error);
    res.status(500).json({ error: 'Failed to get watch dates' });
  }
});

app.get('/api/gamification/load', async (req, res) => {
  try {
    const userId = req.query.userId || 'default_user';
    const userData = await gamificationManager.getUserData(userId);

    res.json({
      achievements: userData.achievements || [],
      userStats: userData.stats || {},
      streakData: { currentStreak: userData.streak || 0 },
      level: userData.level || 1,
      totalPoints: userData.totalPoints || 0,
      badges: userData.badges || []
    });
  } catch (error) {
    console.error('Error loading gamification data:', error);
    res.status(500).json({ error: 'Failed to load gamification data' });
  }
});

// API endpoints for quiz storage
app.post('/api/quiz/store', async (req, res) => {
  try {
    const { videoTitle, questions, createdAt } = req.body;

    if (mongoose.connection.readyState) {
      const collection = mongoose.connection.collection('video_quizzes');
      await collection.updateOne(
        { videoTitle },
        { $set: { videoTitle, questions, createdAt, updatedAt: new Date() } },
        { upsert: true }
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error storing quiz:', error);
    res.status(500).json({ error: 'Failed to store quiz' });
  }
});

app.get('/api/quiz/get/:videoTitle', async (req, res) => {
  try {
    const videoTitle = decodeURIComponent(req.params.videoTitle);

    if (mongoose.connection.readyState) {
      const collection = mongoose.connection.collection('video_quizzes');
      const quiz = await collection.findOne({ videoTitle });

      if (quiz) {
        res.json({ questions: quiz.questions, createdAt: quiz.createdAt });
      } else {
        res.json(null);
      }
    } else {
      res.json(null);
    }
  } catch (error) {
    console.error('Error getting quiz:', error);
    res.status(500).json({ error: 'Failed to get quiz' });
  }
});

// API endpoint to sync localStorage with MongoDB for a specific course
app.post('/api/sync-course', async (req, res) => {
  try {
    const { courseName } = req.body;

    if (!courseName) {
      return res.status(400).json({ error: 'Missing courseName', success: false });
    }

    console.log(`Syncing localStorage with MongoDB for course: ${courseName}`);

    // Force a reconnection attempt if not connected
    if (!mongoose.connection.readyState) {
      try {
        await connectToMongoDB();
      } catch (connErr) {
        return res.status(503).json({ error: 'Could not connect to MongoDB', success: false });
      }
    }

    // Get videos from localStorage
    const localStorage = videoService.getLocalStorage();
    if (!localStorage[courseName]) {
      return res.status(404).json({ error: `Course ${courseName} not found in localStorage`, success: false });
    }

    const localVideos = localStorage[courseName];
    console.log(`Found ${localVideos.length} videos in localStorage for ${courseName}`);

    // Get videos from MongoDB
    const courseCollection = mongoose.connection.collection(courseName);
    const dbVideos = await courseCollection.find({}).toArray();
    console.log(`Found ${dbVideos.length} videos in MongoDB for ${courseName}`);

    let syncedCount = 0;
    let addedCount = 0;
    let updatedCount = 0;

    // Sync each localStorage video with MongoDB
    for (const localVideo of localVideos) {
      if (!localVideo || !localVideo._id) continue;

      const dbVideo = dbVideos.find(v => v._id.toString() === localVideo._id.toString());

      if (dbVideo) {
        // Update existing video with localStorage data
        const updateData = {
          watched: localVideo.watched || false,
          watchedAt: localVideo.watchedAt || null
        };

        // Only update if there are differences
        if (dbVideo.watched !== localVideo.watched ||
          dbVideo.watchedAt !== localVideo.watchedAt) {
          await courseCollection.updateOne(
            { _id: dbVideo._id },
            { $set: updateData }
          );
          updatedCount++;
        }
        syncedCount++;
      } else {
        // Add video to MongoDB if it doesn't exist
        try {
          await courseCollection.insertOne(localVideo);
          addedCount++;
          console.log(`Added video to MongoDB: ${localVideo.title}`);
        } catch (insertErr) {
          console.warn(`Failed to insert video ${localVideo.title}:`, insertErr.message);
        }
      }
    }

    // Update localStorage with any MongoDB videos not in localStorage
    for (const dbVideo of dbVideos) {
      const localVideo = localVideos.find(v => v._id && v._id.toString() === dbVideo._id.toString());
      if (!localVideo) {
        localStorage[courseName].push(dbVideo);
        console.log(`Added video to localStorage: ${dbVideo.title}`);
      }
    }

    // Save updated localStorage
    videoService.saveLocalStorage(localStorage);

    const message = `Sync completed: ${syncedCount} matched, ${updatedCount} updated, ${addedCount} added to MongoDB`;
    console.log(message);

    res.status(200).json({
      success: true,
      message,
      syncedCount,
      updatedCount,
      addedCount,
      totalLocal: localVideos.length,
      totalMongoDB: dbVideos.length
    });
  } catch (err) {
    console.error('Error syncing course:', err);
    res.status(500).json({ error: 'Error syncing course: ' + err.message, success: false });
  }
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

    // Run sync-data.js as a child process to get the same results as terminal
    const { spawn } = require('child_process');
    console.log('Running sync-data.js as child process...');

    const syncProcess = spawn('node', ['sync-data.js'], {
      cwd: __dirname,
      stdio: 'pipe'
    });

    let output = '';
    let errorOutput = '';

    syncProcess.stdout.on('data', (data) => {
      output += data.toString();
      console.log(data.toString().trim());
    });

    syncProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error(data.toString().trim());
    });

    syncProcess.on('close', (code) => {
      if (code === 0) {
        res.status(200).json({
          success: true,
          message: 'Data sync completed successfully!',
          output: output.trim()
        });
      } else {
        res.status(500).json({
          success: false,
          error: errorOutput || 'Sync process failed',
          message: 'Error occurred during sync'
        });
      }
    });

    syncProcess.on('error', (err) => {
      console.error('Failed to start sync process:', err);
      res.status(500).json({
        success: false,
        error: err.message,
        message: 'Failed to start sync process'
      });
    });
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

// Configure multer for local Whisper processing
const whisperUpload = multer({
  dest: path.join(__dirname, 'temp'),
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// API endpoint to process video with Whisper
app.post('/api/process-whisper', whisperUpload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const videoFile = req.file;
    const { title } = req.body;

    // Create whisper and temp directories if they don't exist
    const whisperDir = path.join(__dirname, 'public', 'whisper');
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(whisperDir)) {
      fs.mkdirSync(whisperDir, { recursive: true });
    }
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const videoPath = videoFile.path;
    const srtFileName = `${path.basename(videoFile.filename, path.extname(videoFile.filename))}.srt`;
    const srtPath = path.join(whisperDir, srtFileName);

    console.log(`Starting Whisper processing for: ${title}`);

    // Start Whisper process
    const { spawn } = require('child_process');
    const whisperProcess = spawn('whisper', [
      videoPath,
      '--model', 'large-v3-turbo',
      '--output_format', 'srt',
      '--output_dir', whisperDir,
      '--verbose', 'False'
    ]);

    let progress = 0;
    let errorOutput = '';

    whisperProcess.stderr.on('data', (data) => {
      const output = data.toString();
      errorOutput += output;

      // Parse progress from Whisper output
      const progressMatch = output.match(/(\d+)%/);
      if (progressMatch) {
        progress = parseInt(progressMatch[1]);
      }
    });

    whisperProcess.on('close', (code) => {
      if (code === 0) {
        // Whisper creates file with original name, rename to our format
        const whisperOutput = path.join(whisperDir, `${path.basename(videoPath, path.extname(videoPath))}.srt`);

        if (fs.existsSync(whisperOutput)) {
          fs.renameSync(whisperOutput, srtPath);
          res.json({
            success: true,
            message: 'Caption extraction completed!',
            srtFile: `/whisper/${srtFileName}`,
            downloadUrl: `/download-srt/${srtFileName}`
          });
        } else {
          res.status(500).json({ error: 'Whisper output file not found' });
        }
      } else {
        console.error(`Whisper failed with code ${code}: ${errorOutput}`);
        res.status(500).json({ error: `Whisper extraction failed: ${errorOutput}` });
      }

      // Clean up uploaded video file
      if (fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
    });

    whisperProcess.on('error', (err) => {
      console.error('Failed to start Whisper:', err);
      res.status(500).json({ error: 'Failed to start Whisper process' });
    });

  } catch (err) {
    console.error('Error processing with Whisper:', err);
    res.status(500).json({ error: 'Error processing video' });
  }
});

// API endpoint to get SRT generation progress
app.get('/api/srt-progress/:videoName', (req, res) => {
  const videoName = req.params.videoName;
  const progress = srtGenerationProgress.get(videoName);

  if (progress) {
    res.json(progress);
  } else {
    // Check if SRT file exists across all courses
    const videoDir = path.join(__dirname, 'public', 'videos');
    let srtExists = false;

    try {
      const courseFolders = fs.readdirSync(videoDir).filter(folder =>
        fs.statSync(path.join(videoDir, folder)).isDirectory()
      );

      for (const courseFolder of courseFolders) {
        const findSrt = (dir) => {
          if (!fs.existsSync(dir)) return false;
          const files = fs.readdirSync(dir);
          for (const file of files) {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) {
              if (findSrt(filePath)) return true;
            } else if (file === `${videoName}.srt`) {
              return true;
            }
          }
          return false;
        };

        if (findSrt(path.join(videoDir, courseFolder))) {
          srtExists = true;
          break;
        }
      }
    } catch (error) {
      console.error('Error checking SRT files:', error);
    }

    res.json({
      status: srtExists ? 'completed' : 'not_started',
      progress: srtExists ? 100 : 0
    });
  }
});

// API endpoint to generate SRT for any video
app.post('/api/generate-srt', async (req, res) => {
  try {
    const { videoTitle, courseName, videoId } = req.body;

    if (!videoTitle || !courseName) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Get video from service
    const video = await videoService.getVideoById(courseName, videoId);
    if (!video || !video.videoUrl) {
      return res.status(404).json({ error: 'Video not found or no video URL' });
    }

    const videoPath = path.join(__dirname, 'public', 'videos', video.videoUrl);
    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: 'Video file not found on disk' });
    }

    // Check if already processing
    if (srtGenerationProgress.has(videoTitle)) {
      return res.json({ message: 'SRT generation already in progress', status: 'processing' });
    }

    // Start SRT generation
    console.log(`Starting SRT generation for: ${videoTitle}`);
    srtGenerationProgress.set(videoTitle, { status: 'processing', progress: 0 });

    // Import SRT generator
    const srtQuizGenerator = require('./services/srtQuizGenerator');

    // Generate SRT in background
    srtQuizGenerator.generateSRT(videoPath)
      .then(async (srtPath) => {
        console.log(`SRT generation completed for: ${videoTitle}`);
        srtGenerationProgress.set(videoTitle, { status: 'completed', progress: 100 });

        // Generate summary and topics after SRT completion
        try {
          const srtEntries = srtQuizGenerator.parseSRT(srtPath);
          if (srtEntries && srtEntries.length > 3) {
            const summaryData = await srtQuizGenerator.generateSummaryAndTopics(srtEntries, videoTitle);
            console.log(`Generated summary and topics for: ${videoTitle}`);

            // Store summary data
            const dataDir = path.join(__dirname, 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
            const summaryPath = path.join(dataDir, 'video_summaries.json');
            const summaries = fs.existsSync(summaryPath) ? JSON.parse(fs.readFileSync(summaryPath, 'utf8')) : {};
            summaries[videoTitle] = summaryData;
            fs.writeFileSync(summaryPath, JSON.stringify(summaries, null, 2));
          }
        } catch (summaryError) {
          console.warn(`Summary generation failed for ${videoTitle}:`, summaryError.message);
        }

        // Clean up progress after 60 seconds
        setTimeout(() => srtGenerationProgress.delete(videoTitle), 60000);
      })
      .catch(error => {
        console.error(`SRT generation failed for ${videoTitle}:`, error.message);
        srtGenerationProgress.set(videoTitle, { status: 'failed', progress: 0 });
        setTimeout(() => srtGenerationProgress.delete(videoTitle), 60000);
      });

    res.json({ message: 'SRT generation started', status: 'processing' });
  } catch (error) {
    console.error('Error starting SRT generation:', error);
    res.status(500).json({ error: 'Failed to start SRT generation' });
  }
});

// API endpoint to get Whisper progress
app.get('/api/whisper-progress/:filename', (req, res) => {
  // This would need to be implemented with a progress tracking system
  // For now, return a simple response
  res.json({ progress: 50, status: 'processing' });
});

// Route to download SRT files
app.get('/download-srt/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'public', 'whisper', filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath, filename);
  } else {
    res.status(404).send('SRT file not found');
  }
});

// Import SRT quiz generator
const srtQuizGenerator = require('./services/srtQuizGenerator');

// Import pre-generated quiz service
const preGeneratedQuizService = require('./services/preGeneratedQuizzes');

// Import PDF todo extractor and knowledge service
const pdfTodoExtractor = require('./services/pdfTodoExtractor');
const pdfKnowledgeService = require('./services/pdfKnowledgeService');

// API endpoint to generate quiz from video SRT or pre-generated
app.get('/api/quiz/generate/:courseName/:videoId', async (req, res) => {
  try {
    const courseName = decodeURIComponent(req.params.courseName);
    const videoId = req.params.videoId;
    console.log(`Quiz generation requested for course: ${courseName}, video: ${videoId}`);

    const video = await videoService.getVideoById(courseName, videoId);
    if (!video) {
      console.error(`Video not found: ${videoId} in course ${courseName}`);
      return res.status(404).json({ error: 'Video not found' });
    }

    console.log(`Video found: ${video.title}`);
    let questions = [];

    // Try SRT-based quiz first
    try {
      if (video.videoUrl) {
        const videoPath = path.join(__dirname, 'public', 'videos', video.videoUrl);
        console.log(`Checking video path: ${videoPath}`);

        if (fs.existsSync(videoPath)) {
          console.log('Video file exists, attempting SRT generation...');
          try {
            const srtPath = await srtQuizGenerator.generateSRT(videoPath);
            const srtEntries = srtQuizGenerator.parseSRT(srtPath);

            if (srtEntries && srtEntries.length > 3) {
              questions = await srtQuizGenerator.generateQuestions(srtEntries, video.title);
              console.log(`Generated ${questions.length} AI-powered questions`);
            } else {
              console.log('SRT entries too few or empty');
            }
          } catch (srtGenError) {
            console.error('SRT generation error:', srtGenError.message);
          }
        } else {
          console.log('Video file does not exist on disk');
        }
      } else {
        console.log('Video has no videoUrl property');
      }
    } catch (srtError) {
      console.warn('SRT quiz generation failed:', srtError.message);
    }

    // Only use AI-generated questions, no fallback
    if (questions.length === 0) {
      console.log('No AI questions generated, returning empty');
      return res.json({ questions: [], videoTitle: video.title, quizType: 'none' });
    }

    const quizType = questions.length > 0 && questions[0].id.startsWith('ai') ? 'ai' : 'unknown';
    console.log(`Returning ${questions.length} AI questions`);

    res.json({
      questions,
      videoTitle: video.title,
      quizType
    });
  } catch (error) {
    console.error('Error generating quiz:', error);
    res.status(500).json({ error: 'Failed to generate quiz' });
  }
});

// API endpoint to get video summary and topics
app.get('/api/video/summary/:videoName', async (req, res) => {
  try {
    const videoName = req.params.videoName;
    const summaryPath = path.join(__dirname, 'data', 'video_summaries.json');

    // Check if summary already exists
    if (fs.existsSync(summaryPath)) {
      const summaries = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      if (summaries[videoName]) {
        return res.json(summaries[videoName]);
      }
    }

    // If no summary exists, try to generate it from existing SRT
    const videoDir = path.join(__dirname, 'public', 'videos');
    const courseFolders = fs.readdirSync(videoDir).filter(folder =>
      fs.statSync(path.join(videoDir, folder)).isDirectory()
    );

    let srtPath = null;
    for (const courseFolder of courseFolders) {
      const coursePath = path.join(videoDir, courseFolder);
      const findSrt = (dir) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          if (fs.statSync(filePath).isDirectory()) {
            const result = findSrt(filePath);
            if (result) return result;
          } else if (file === `${videoName}.srt`) {
            return filePath;
          }
        }
        return null;
      };
      srtPath = findSrt(coursePath);
      if (srtPath) break;
    }

    if (srtPath && fs.existsSync(srtPath)) {
      console.log(`Generating summary for existing SRT: ${videoName}`);
      const srtQuizGenerator = require('./services/srtQuizGenerator');
      const srtEntries = srtQuizGenerator.parseSRT(srtPath);

      if (srtEntries && srtEntries.length > 3) {
        const summaryData = await srtQuizGenerator.generateSummaryAndTopics(srtEntries, videoName);

        // Store the generated summary
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
        const summaries = fs.existsSync(summaryPath) ? JSON.parse(fs.readFileSync(summaryPath, 'utf8')) : {};
        summaries[videoName] = summaryData;
        fs.writeFileSync(summaryPath, JSON.stringify(summaries, null, 2));

        console.log(`Generated and stored summary for: ${videoName}`);
        return res.json(summaryData);
      }
    }

    res.json({ summary: null, keyTopics: [] });
  } catch (error) {
    console.error('Error getting video summary:', error);
    res.status(500).json({ error: 'Failed to get video summary' });
  }
});

// API endpoint to get todos for a video (AI-powered with SRT and PDF extraction)
app.get('/api/video/todos/:courseName/:videoTitle', async (req, res) => {
  try {
    const courseName = decodeURIComponent(req.params.courseName);
    const videoTitle = decodeURIComponent(req.params.videoTitle);

    console.log(`Getting AI-powered todos for video: ${videoTitle} in course: ${courseName}`);

    // Import AI todo extractor
    const aiTodoExtractor = require('./services/aiTodoExtractor');

    let todos;
    try {
      // Use AI extraction from SRT and PDF content
      todos = await aiTodoExtractor.getTodosForVideo(videoTitle, courseName);
      console.log(`Generated ${todos.length} AI-powered todo categories`);

      // If AI extraction fails or returns empty, fallback to PDF extraction
      if (!todos || todos.length === 0) {
        console.log('AI extraction returned empty, trying PDF extraction...');
        todos = await pdfKnowledgeService.getTodosForVideo(videoTitle, courseName);
      }

      // Final fallback to template-based
      if (!todos || todos.length === 0) {
        console.log('PDF extraction failed, using template fallback...');
        todos = pdfTodoExtractor.getTodosForVideo(videoTitle, courseName);
      }

    } catch (aiError) {
      console.warn('AI todo extraction failed:', aiError.message);

      // Fallback to PDF extraction
      try {
        todos = await pdfKnowledgeService.getTodosForVideo(videoTitle, courseName);
      } catch (pdfError) {
        console.warn('PDF extraction also failed, using template fallback');
        todos = pdfTodoExtractor.getTodosForVideo(videoTitle, courseName);
      }
    }

    res.json({ todos, videoTitle, courseName, source: 'ai-powered' });
  } catch (error) {
    console.error('Error getting video todos:', error);
    res.status(500).json({ error: 'Failed to get video todos' });
  }
});

// API endpoint to generate AI todos manually
app.post('/api/video/todos/generate', async (req, res) => {
  try {
    const { videoTitle, courseName } = req.body;

    if (!videoTitle || !courseName) {
      return res.status(400).json({ error: 'Missing videoTitle or courseName' });
    }

    console.log(`Manually generating AI todos for: ${videoTitle}`);

    const aiTodoExtractor = require('./services/aiTodoExtractor');

    // Clear cache to force fresh generation
    const cacheKey = `${courseName}_${videoTitle}`;
    if (aiTodoExtractor.cache.has(cacheKey)) {
      aiTodoExtractor.cache.delete(cacheKey);
    }

    // Generate fresh AI todos
    const todos = await aiTodoExtractor.getTodosForVideo(videoTitle, courseName);

    res.json({
      success: true,
      todos,
      message: 'AI todos generated successfully',
      source: 'ai-fresh'
    });
  } catch (error) {
    console.error('Error generating AI todos:', error);
    res.status(500).json({ error: 'Failed to generate AI todos' });
  }
});

// API endpoint to update todo completion status
app.post('/api/video/todos/update', async (req, res) => {
  try {
    const { videoTitle, courseName, todoId, completed } = req.body;

    // Store todo completion in localStorage-like structure
    const todoDataPath = path.join(__dirname, 'data', 'todo_progress.json');
    const dataDir = path.join(__dirname, 'data');

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    let todoProgress = {};
    if (fs.existsSync(todoDataPath)) {
      todoProgress = JSON.parse(fs.readFileSync(todoDataPath, 'utf8'));
    }

    const key = `${courseName}_${videoTitle}`;
    if (!todoProgress[key]) {
      todoProgress[key] = {};
    }

    todoProgress[key][todoId] = {
      completed,
      completedAt: completed ? new Date().toISOString() : null
    };

    fs.writeFileSync(todoDataPath, JSON.stringify(todoProgress, null, 2));

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating todo:', error);
    res.status(500).json({ error: 'Failed to update todo' });
  }
});

// API endpoint to get todo progress
app.get('/api/video/todos/progress/:courseName/:videoTitle', async (req, res) => {
  try {
    const courseName = decodeURIComponent(req.params.courseName);
    const videoTitle = decodeURIComponent(req.params.videoTitle);

    const todoDataPath = path.join(__dirname, 'data', 'todo_progress.json');

    if (!fs.existsSync(todoDataPath)) {
      return res.json({ progress: {} });
    }

    const todoProgress = JSON.parse(fs.readFileSync(todoDataPath, 'utf8'));
    const key = `${courseName}_${videoTitle}`;

    res.json({ progress: todoProgress[key] || {} });
  } catch (error) {
    console.error('Error getting todo progress:', error);
    res.status(500).json({ error: 'Failed to get todo progress' });
  }
});

// API endpoint for Terraform course organization using AWS Nova AI
app.post('/api/terraform/organize', async (req, res) => {
  try {
    const { videoTitle, courseName, currentProgress } = req.body;

    if (!videoTitle || !courseName) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    console.log(`Organizing Terraform course for video: ${videoTitle}`);

    const aiService = require('./services/aiService');

    // Create Terraform-specific learning suggestions
    const prompt = `You are a HashiCorp Certified Terraform Associate instructor. Based on this video title and progress, provide 3-5 specific learning suggestions.

Video: ${videoTitle}
Course: ${courseName}
Progress: ${currentProgress}%

Provide practical, actionable suggestions for Terraform learning. Focus on:
- Next logical steps
- Hands-on practice recommendations
- Key concepts to reinforce
- Common pitfalls to avoid

Return JSON array of strings:
["suggestion1", "suggestion2", "suggestion3"]

Return only the JSON array.`;

    try {
      const response = await aiService.generateContent(prompt);
      const suggestions = JSON.parse(response.trim());

      res.json({
        success: true,
        suggestions,
        videoTitle,
        source: 'aws-nova'
      });
    } catch (parseError) {
      // Fallback suggestions for Terraform
      const fallbackSuggestions = [
        "Practice writing basic Terraform configuration files with providers and resources",
        "Set up a remote state backend using S3 and DynamoDB for state locking",
        "Experiment with terraform plan and apply in a safe development environment",
        "Learn about Terraform modules to create reusable infrastructure components",
        "Understand the Terraform state file and why it's crucial for infrastructure management"
      ];

      res.json({
        success: true,
        suggestions: fallbackSuggestions,
        videoTitle,
        source: 'fallback'
      });
    }
  } catch (error) {
    console.error('Error organizing Terraform course:', error);
    res.status(500).json({ error: 'Failed to organize course' });
  }
});

// API endpoint to organize entire Terraform course structure using AWS Nova AI
app.post('/api/terraform/organize-course', async (req, res) => {
  try {
    const { courseName } = req.body;
    
    if (!courseName) {
      return res.status(400).json({ error: 'Missing courseName' });
    }
    
    console.log(`Organizing entire Terraform course: ${courseName}`);
    
    // Get all videos for the course
    const videos = await videoService.getVideosForCourse(courseName);
    if (!videos || videos.length === 0) {
      return res.status(404).json({ error: 'No videos found for course' });
    }
    
    const aiService = require('./services/aiService');
    
    // Create video titles list for AI analysis
    const videoTitles = videos.map(v => v.title).join('\n');
    
    const prompt = `You are a HashiCorp Certified Terraform Associate instructor. Analyze these video titles and create an optimal learning path organization.

Course: ${courseName}
Video Titles:
${videoTitles}

Create a structured learning path with:
1. Logical chapter groupings
2. Prerequisites and dependencies
3. Hands-on lab recommendations
4. Key concepts for each section

Return JSON:
{
  "learningPath": [
    {
      "chapter": "Chapter Name",
      "description": "What students will learn",
      "videos": ["video1", "video2"],
      "keyTopics": ["topic1", "topic2"],
      "labExercises": ["exercise1", "exercise2"]
    }
  ],
  "prerequisites": ["prerequisite1", "prerequisite2"],
  "learningObjectives": ["objective1", "objective2"]
}

Return only the JSON object.`;
    
    try {
      const response = await aiService.generateContent(prompt);
      const organization = JSON.parse(response.trim());
      
      res.json({ 
        success: true, 
        organization,
        totalVideos: videos.length,
        source: 'aws-nova'
      });
    } catch (parseError) {
      console.warn('AI parsing failed, using structured fallback');
      
      // Create structured fallback based on video analysis
      const chapters = {};
      videos.forEach(video => {
        const title = video.title.toLowerCase();
        let chapter = 'Introduction';
        
        if (title.includes('provider') || title.includes('setup')) {
          chapter = 'Getting Started';
        } else if (title.includes('resource') || title.includes('ec2') || title.includes('s3')) {
          chapter = 'Core Resources';
        } else if (title.includes('state') || title.includes('backend')) {
          chapter = 'State Management';
        } else if (title.includes('module') || title.includes('reusable')) {
          chapter = 'Modules & Reusability';
        } else if (title.includes('variable') || title.includes('output')) {
          chapter = 'Variables & Outputs';
        } else if (title.includes('advanced') || title.includes('best practice')) {
          chapter = 'Advanced Topics';
        }
        
        if (!chapters[chapter]) chapters[chapter] = [];
        chapters[chapter].push(video.title);
      });
      
      const learningPath = Object.keys(chapters).map(chapter => ({
        chapter,
        description: `Learn ${chapter.toLowerCase()} concepts and practical implementation`,
        videos: chapters[chapter],
        keyTopics: [`${chapter} fundamentals`, `Hands-on practice`, 'Best practices'],
        labExercises: [`Practice ${chapter.toLowerCase()}`, 'Build real-world examples']
      }));
      
      res.json({ 
        success: true, 
        organization: {
          learningPath,
          prerequisites: ['Basic cloud computing knowledge', 'Command line familiarity'],
          learningObjectives: ['Master Terraform fundamentals', 'Build infrastructure as code', 'Pass HashiCorp certification']
        },
        totalVideos: videos.length,
        source: 'structured-fallback'
      });
    }
  } catch (error) {
    console.error('Error organizing Terraform course:', error);
    res.status(500).json({ error: 'Failed to organize course' });
  }
});

// API endpoint to generate course description using AI with better fallback
app.get('/api/course/description/:courseName', async (req, res) => {
  try {
    const courseName = decodeURIComponent(req.params.courseName);
    console.log(`Generating description for course: ${courseName}`);

    // Try to get video summaries first
    const summaryPath = path.join(__dirname, 'data', 'video_summaries.json');
    let description = null;

    if (fs.existsSync(summaryPath)) {
      try {
        const summaries = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
        const courseVideos = Object.entries(summaries).filter(([videoName, data]) => {
          const courseKey = courseName.toLowerCase().split(' ')[0];
          return videoName.toLowerCase().includes(courseKey) ||
            videoName.toLowerCase().includes('lesson') ||
            videoName.toLowerCase().includes('introduction') ||
            videoName.toLowerCase().includes('tutorial');
        });

        if (courseVideos.length > 0) {
          console.log(`Found ${courseVideos.length} video summaries for AI generation`);
          const aiService = require('./services/aiService');

          const videoSummaries = courseVideos.map(([name, data]) => data.summary).join(' ');
          const allTopics = [...new Set(courseVideos.flatMap(([name, data]) => data.keyTopics || []))];

          description = await aiService.generateCourseDescription(videoSummaries, allTopics, courseName);
          console.log('AI description generated successfully');
        }
      } catch (summaryError) {
        console.warn('Error processing video summaries:', summaryError.message);
      }
    }

    // If AI generation failed, try course summary data
    if (!description) {
      console.log('AI generation failed, trying course summary fallback');
      try {
        const summaryResponse = await fetch(`http://localhost:${config.port}/api/course/summary/${encodeURIComponent(courseName)}`);
        if (summaryResponse.ok) {
          const summaryData = await summaryResponse.json();
          if (summaryData && summaryData.totalVideos > 0) {
            description = `Master ${courseName} with ${summaryData.totalVideos} comprehensive lessons${summaryData.chapters > 0 ? ` across ${summaryData.chapters} chapters` : ''}. Build practical skills through hands-on exercises and real-world applications.`;
            console.log('Generated fallback description from course summary');
          }
        }
      } catch (summaryError) {
        console.warn('Course summary fallback failed:', summaryError.message);
      }
    }

    // Final fallback based on course name
    if (!description) {
      console.log('Using final template fallback');
      if (courseName.toLowerCase().includes('davinci') || courseName.toLowerCase().includes('video')) {
        description = `Master professional video editing with DaVinci Resolve. Learn color grading, audio editing, visual effects, and advanced editing techniques through practical, hands-on projects.`;
      } else if (courseName.toLowerCase().includes('aws')) {
        description = `Comprehensive AWS cloud computing course covering core services, architecture patterns, and best practices. Build scalable, secure cloud solutions with hands-on labs and real-world scenarios.`;
      } else if (courseName.toLowerCase().includes('devops')) {
        description = `Complete DevOps bootcamp covering CI/CD, containerization, infrastructure as code, and automation. Master modern development and deployment practices with practical exercises.`;
      } else {
        description = `Comprehensive ${courseName} course with practical exercises, real-world applications, and hands-on learning. Master essential skills through structured lessons and projects.`;
      }
    }

    res.json({ description });
  } catch (error) {
    console.error('Error generating course description:', error);
    // Return a basic fallback description
    const courseName = decodeURIComponent(req.params.courseName);
    res.json({
      description: `Learn ${courseName} through comprehensive lessons and practical exercises. Build real-world skills with hands-on projects and expert guidance.`
    });
  }
});

// Chatbot route
app.get('/chatbot', (req, res) => {
  res.render('chatbot');
});

// Simple offline chatbot responses
function getOfflineResponse(message, courseName, videoTitle) {
  const msg = message.toLowerCase();

  if (msg.includes('terraform')) {
    return "Indeed! Terraform is fantastic for Infrastructure as Code! Think of it as writing a blueprint for your entire cloud setup. The beauty is in the declarative approach - you describe what you want, and Terraform figures out how to get there. Start with 'terraform init', 'terraform plan', and 'terraform apply'. Remember, always version control your .tf files! 🏗️";
  }

  if (msg.includes('provider') || msg.includes('resource')) {
    return "Great question! In Terraform, providers are plugins that interact with APIs of cloud platforms like AWS, Azure, or GCP. Resources are the actual infrastructure components you want to create - like EC2 instances, S3 buckets, or VPCs. Think of providers as translators and resources as the things you're building! 🔧";
  }

  if (msg.includes('state') || msg.includes('tfstate')) {
    return "Ah, Terraform state! This is crucial - the state file is Terraform's memory of what it has created. It maps your configuration to real-world resources. Always store state remotely (like in S3 with DynamoDB locking) for team collaboration. Never edit state files manually - use 'terraform state' commands instead! 📊";
  }

  if (msg.includes('module') || msg.includes('modules')) {
    return "Modules are the secret sauce of Terraform! They're reusable packages of Terraform configuration. Think of them like functions in programming - write once, use many times. Start with simple modules for common patterns like VPC setup or security groups. The Terraform Registry has tons of community modules too! 📦";
  }

  if (msg.includes('aws') || msg.includes('cloud')) {
    return "Excellent question about AWS! The cloud is like having a massive data center at your fingertips. With Terraform, you can provision AWS resources declaratively. Start with simple resources like S3 buckets and EC2 instances, then work your way up to complex architectures. Always follow the principle of least privilege! ☁️";
  }

  if (msg.includes('docker')) {
    return "Indeed! Docker is fantastic for containerization! Think of containers like shipping containers - they package your application with everything it needs to run consistently anywhere. Start with 'docker run hello-world' to test your setup, then try containerizing a simple app. The beauty is in the isolation and portability! 🐳";
  }

  if (msg.includes('git')) {
    return "Ah, Git! The version control system that's absolutely essential for any developer. Think of it like a time machine for your code - you can go back to any previous version, create parallel universes (branches), and merge them back together. Start with 'git init', 'git add', and 'git commit' - these are your bread and butter! 📚";
  }

  if (msg.includes('vpc') || msg.includes('virtual private cloud')) {
    return "Indeed! A VPC (Virtual Private Cloud) is like having your own private section of the AWS cloud! Think of it as your own isolated network where you can launch AWS resources securely. It's like having a private office building in a massive business complex - you control who gets in and how rooms connect to each other. You define IP address ranges, create subnets, and configure route tables. Essential for any serious AWS architecture! 🏢";
  }

  if (msg.includes('kubernetes') || msg.includes('k8s')) {
    return "Kubernetes! The orchestrator of containers! Think of it as a conductor leading an orchestra of containers. It handles scaling, healing, and managing your containerized applications. Start with pods (the smallest unit), then services, and deployments. It's complex but incredibly powerful! 🎼";
  }

  if (msg.includes('jenkins') || msg.includes('ci/cd')) {
    return "CI/CD with Jenkins is like having a robot assistant that builds and deploys your code automatically! Every time you push code, Jenkins can run tests, build your application, and deploy it. Think of it as an assembly line for software - automation is key to DevOps success! 🤖";
  }

  return `That's a thoughtful question about ${videoTitle || 'this topic'}! While I'm running in offline mode right now, I encourage you to break down the problem step by step.\n\nIn ${courseName?.includes('Terraform') ? 'Terraform and Infrastructure as Code' : 'DevOps'}, we always start with the fundamentals and build up. Don't be afraid to experiment in a safe environment - that's how we learn best!\n\nKeep exploring and asking great questions like this one! 🚀`;
}

// Chatbot API endpoint with AI and offline fallback
app.post('/api/chatbot', async (req, res) => {
  try {
    const { message, courseName, videoTitle } = req.body;
    console.log(`Chatbot request: "${message}" for course: ${courseName}, video: ${videoTitle}`);

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Try AI service first
    try {
      const aiService = require('./services/aiService');
      const context = courseName ? `Course: ${courseName}${videoTitle ? `, Video: ${videoTitle}` : ''}` : '';
      const aiResponse = await aiService.generateChatResponse(message, context);
      console.log('AI response generated successfully');
      res.json({ response: aiResponse });
      return;
    } catch (aiError) {
      console.warn('AI service failed:', aiError.message);
      // Fall back to offline response
      const offlineResponse = getOfflineResponse(message, courseName, videoTitle);
      console.log('Using offline fallback response');
      res.json({ response: offlineResponse });
    }

  } catch (error) {
    console.error('Chatbot error:', error);
    const fallbackResponse = getOfflineResponse(message, courseName, videoTitle);
    res.json({ response: fallbackResponse });
  }
});

//add code to get http://localhost:3000/profile 
app.get('/profile', (req, res) => {
  res.render('profile');
});

// Admin panel for video management
app.get('/admin', (req, res) => {
  res.render('admin');
});
// Add code to get http://localhost:3000/settings
app.get('/settings', (req, res) => {
  res.render('settings');
});
// Test quiz page
app.get('/test-quiz', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-quiz.html'));
});

// Video management API endpoints
app.post('/api/videos/sync', async (req, res) => {
  try {
    const result = await videoManager.syncUI();
    res.json(result);
  } catch (error) {
    console.error('Video sync error:', error);
    res.status(500).json({ error: 'Video sync failed', message: error.message });
  }
});

app.get('/api/videos/process-status', (req, res) => {
  res.json({
    processing: false,
    lastSync: new Date().toISOString(),
    status: 'ready'
  });
});

app.get('/api/course/summary/:courseName', async (req, res) => {
  try {
    const courseName = decodeURIComponent(req.params.courseName);
    console.log(`Getting course summary for: ${courseName}`);

    const summaryPath = path.join(__dirname, 'data', 'course_summaries.json');

    if (fs.existsSync(summaryPath)) {
      const summaries = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      if (summaries[courseName]) {
        console.log('Found existing course summary');
        return res.json(summaries[courseName]);
      }
    }

    // Generate summary from localStorage if not found
    const localStorage = videoService.getLocalStorage();
    const videos = localStorage[courseName] || [];
    console.log(`Found ${videos.length} videos in localStorage for summary`);

    if (videos.length > 0) {
      const chapters = [...new Set(videos.map(v => v.chapter).filter(Boolean))];
      const watchedVideos = videos.filter(v => v.watched).length;

      const summary = {
        title: courseName,
        totalVideos: videos.length,
        watchedVideos: watchedVideos,
        chapters: chapters.length,
        chapterList: chapters,
        videosWithThumbnails: videos.filter(v => v.thumbnailUrl).length,
        completionPercentage: Math.round((watchedVideos / videos.length) * 100),
        lastUpdated: new Date().toISOString()
      };

      console.log('Generated course summary:', summary);
      res.json(summary);
    } else {
      console.log('No videos found for course summary');
      // Return basic summary even if no videos
      res.json({
        title: courseName,
        totalVideos: 0,
        watchedVideos: 0,
        chapters: 0,
        chapterList: [],
        videosWithThumbnails: 0,
        completionPercentage: 0,
        lastUpdated: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error getting course summary:', error);
    res.status(500).json({ error: 'Failed to get course summary' });
  }
});
// Track SRT generation progress
const srtGenerationProgress = new Map();
global.srtGenerationProgress = srtGenerationProgress;

// Track video processing progress
const videoProcessingProgress = new Map();
global.videoProcessingProgress = videoProcessingProgress;

// API endpoint to update video with thumbnail from folder
app.post('/api/videos/update-thumbnail', async (req, res) => {
  try {
    const { videoId, courseName } = req.body;
    
    if (!videoId || !courseName) {
      return res.status(400).json({ error: 'Missing videoId or courseName' });
    }

    // Get video from service
    const video = await videoService.getVideoById(courseName, videoId);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Find or generate thumbnail
    const thumbnailsDir = path.join(__dirname, 'public', 'thumbnails');
    const thumbnailFiles = fs.readdirSync(thumbnailsDir).filter(f => f.endsWith('.jpg'));
    let matchingThumbnail = thumbnailFiles.find(f => f.startsWith(videoId));
    
    if (!matchingThumbnail && video.videoUrl) {
      const videoPath = path.join(__dirname, 'public', 'videos', video.videoUrl);
      if (fs.existsSync(videoPath)) {
        const thumbnailGenerator = require('./services/thumbnailGenerator');
        const generatedUrl = await thumbnailGenerator.generateThumbnail(videoPath, videoId);
        matchingThumbnail = generatedUrl ? path.basename(generatedUrl) : null;
      }
    }
    
    const thumbnailUrl = matchingThumbnail ? `/thumbnails/${matchingThumbnail}` : null;

    // Update localStorage
    const localStorage = videoService.getLocalStorage();
    if (localStorage[courseName]) {
      const videoIndex = localStorage[courseName].findIndex(v => v._id.toString() === videoId);
      if (videoIndex >= 0) {
        localStorage[courseName][videoIndex].thumbnailUrl = thumbnailUrl;
        videoService.saveLocalStorage(localStorage);
      }
    }

    // Update MongoDB if connected
    if (mongoose.connection.readyState) {
      try {
        const courseCollection = mongoose.connection.collection(courseName);
        await courseCollection.updateOne(
          { _id: new ObjectId(videoId) },
          { $set: { thumbnailUrl: thumbnailUrl } }
        );
      } catch (dbErr) {
        console.error('Error updating MongoDB:', dbErr);
      }
    }

    res.json({ 
      success: true, 
      thumbnailUrl,
      message: 'Thumbnail URL updated from folder structure' 
    });
  } catch (error) {
    console.error('Error updating thumbnail from folder:', error);
    res.status(500).json({ error: 'Failed to update thumbnail from folder' });
  }
});

// API endpoint to display video in interface
app.get('/api/videos/display/:courseName/:videoId', async (req, res) => {
  try {
    const courseName = decodeURIComponent(req.params.courseName);
    const videoId = req.params.videoId;
    
    // Get video from service
    const video = await videoService.getVideoById(courseName, videoId);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Update thumbnail if not set
    if (!video.thumbnailUrl) {
      const thumbnailsDir = path.join(__dirname, 'public', 'thumbnails');
      const thumbnailFiles = fs.readdirSync(thumbnailsDir).filter(f => f.endsWith('.jpg'));
      let matchingThumbnail = thumbnailFiles.find(f => f.startsWith(videoId));
      
      if (!matchingThumbnail && video.videoUrl) {
        const videoPath = path.join(__dirname, 'public', 'videos', video.videoUrl);
        if (fs.existsSync(videoPath)) {
          const thumbnailGenerator = require('./services/thumbnailGenerator');
          const generatedUrl = await thumbnailGenerator.generateThumbnail(videoPath, videoId);
          matchingThumbnail = generatedUrl ? path.basename(generatedUrl) : null;
        }
      }
      
      const thumbnailUrl = matchingThumbnail ? `/thumbnails/${matchingThumbnail}` : null;
      
      // Update video with thumbnail
      const localStorage = videoService.getLocalStorage();
      if (localStorage[courseName]) {
        const videoIndex = localStorage[courseName].findIndex(v => v._id.toString() === videoId);
        if (videoIndex >= 0) {
          localStorage[courseName][videoIndex].thumbnailUrl = thumbnailUrl;
          videoService.saveLocalStorage(localStorage);
          video.thumbnailUrl = thumbnailUrl;
        }
      }
    }

    res.json({ 
      success: true, 
      video,
      displayUrl: `/course/${encodeURIComponent(courseName)}/video/${videoId}`,
      message: 'Video ready for display' 
    });
  } catch (error) {
    console.error('Error preparing video for display:', error);
    res.status(500).json({ error: 'Failed to prepare video for display' });
  }
});

// Start server
app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  console.log('\n📊 Sync Commands:');
  console.log('curl -X POST http://localhost:3000/api/sync-course -H "Content-Type: application/json" -d "{\"courseName\":\"dev-ops-bootcamp_202201\"}"');
  console.log('curl http://localhost:3000/api/videos/localStorage?courseName=dev-ops-bootcamp_202201');
  console.log('\n🎬 Video Commands:');
  console.log('curl -X POST http://localhost:3000/api/videos/update-thumbnail -H "Content-Type: application/json" -d "{\"videoId\":\"689c6fd9233635fb8f7d297e\",\"courseName\":\"HashiCorp Certified Terraform Associate - Hands-On Labs\"}"');
  console.log('curl http://localhost:3000/api/videos/display/HashiCorp%20Certified%20Terraform%20Associate%20-%20Hands-On%20Labs/689c6fd9233635fb8f7d297e');

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
