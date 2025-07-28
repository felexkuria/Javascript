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

        // Generate thumbnails for each video
        for (const video of videoDocuments) {
          try {
            const videoPath = path.join(videoDir, video.videoUrl);
            const thumbnailUrl = await thumbnailGenerator.generateThumbnail(videoPath, video._id);
            console.log(`Generated thumbnail for video ${video.title}: ${thumbnailUrl}`);

            // Update video document with thumbnail URL
            await courseCollection.updateOne(
              { _id: video._id },
              { $set: { thumbnailUrl: thumbnailUrl } }
            );
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

// View engine setup
app.set('view engine', 'ejs');


// Routes

// Course video route
app.get('/course/:courseName/video/:videoId?', async (req, res) => {
  try {
    const courseName = req.params.courseName;
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
        return a.chapter.localeCompare(b.chapter);
      }
      
      // Extract numbers from titles
      const aMatch = a.title ? a.title.match(/\d+/) : null;
      const bMatch = b.title ? b.title.match(/\d+/) : null;

      // Convert to numbers and ensure proper comparison
      const aNum = aMatch ? parseInt(aMatch[0], 10) : 0;
      const bNum = bMatch ? parseInt(bMatch[0], 10) : 0;

      // Log sorting for debugging
      console.log(`Comparing: ${a.title} (${aNum}) vs ${b.title} (${bNum})`);
      
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
          // Extract numbers and ensure proper parsing of double-digit numbers
          const aMatch = a.title?.match(/\d+/);
          const bMatch = b.title?.match(/\d+/);
          const aNum = aMatch ? parseInt(aMatch[0], 10) : 0;
          const bNum = bMatch ? parseInt(bMatch[0], 10) : 0;
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
    const courseName = req.params.courseName;
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
    const courseName = decodeURIComponent(req.params.courseName);
    const id = req.params.id;
    console.log(`Fetching video: ${courseName}/${id}`);

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

    // Check if video has a videoUrl property
    if (!video.videoUrl) {
      console.error(`Video ${id} has no videoUrl property`);
      return res.status(404).send('Video URL not found');
    }
    
    // Check if video has a videoUrl property before using it
    if (!video.videoUrl) {
      console.warn(`Video ${id} has no videoUrl property`);
      // Skip file check and continue to render the page
    } else {
      const videoPath = path.join(__dirname, 'public', 'videos', video.videoUrl);
      console.log("Serving video from:", videoPath);

      if (!fs.existsSync(videoPath)) {
        console.error(`Video file not found on disk: ${videoPath}`);
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
      console.warn(`Video ${id} has no URL, sending placeholder video`);
      // Send a placeholder video or error response
      return res.status(200).sendFile(path.join(__dirname, 'public', 'placeholder.mp4'), (err) => {
        if (err) {
          // If placeholder doesn't exist, send a more helpful error
          console.error('Placeholder video not found, sending error response');
          return res.status(404).send('Video file not available in offline mode');
        }
      });
    }
    
    // At this point we know video.videoUrl exists
    const videoPath = path.join(__dirname, 'public', 'videos', video.videoUrl);
    console.log("Streaming video from:", videoPath);

    if (!fs.existsSync(videoPath)) {
      console.error(`Video file not found on disk: ${videoPath}`);
      return res.status(404).send('Video file not found on disk');
    }

    // Stream the video file
    res.sendFile(videoPath);
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
      localStorage[courseName][videoIndex].watchedAt = new Date();
    } else {
      // Add complete video data
      localStorage[courseName].push({
        ...video,
        watched: true,
        watchedAt: new Date()
      });
    }

    videoService.saveLocalStorage(localStorage);
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
      '--model', 'base',
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
