const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs');
const dynamoVideoService = require('../services/dynamoVideoService');
const thumbnailGenerator = require('../services/thumbnailGenerator');

class UploadController {
  constructor() {
    this.setupStorage();
  }

  setupStorage() {
    // Configure AWS S3
    this.s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

    // Configure multer storage
    // eslint-disable-next-line no-constant-condition
    if (false) { // Disable S3 for now
      console.log('Using S3 storage for uploads');
      this.storage = multerS3({
        s3: this.s3,
        bucket: process.env.S3_BUCKET_NAME,
        acl: 'public-read',
        key: function (req, file, cb) {
          cb(null, 'uploads/' + Date.now().toString() + '-' + file.originalname);
        }
      });
    } else {
      console.log('Using local storage for uploads');
      const uploadsDir = path.join(__dirname, '../../../frontend/public/uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      this.storage = multer.diskStorage({
        destination: function (req, file, cb) {
          cb(null, uploadsDir);
        },
        filename: function (req, file, cb) {
          cb(null, Date.now() + '-' + file.originalname);
        }
      });
    }

    this.upload = multer({ storage: this.storage });
    this.multiUpload = multer({ storage: this.storage }).fields([
      { name: 'video', maxCount: 1 },
      { name: 'captions', maxCount: 1 }
    ]);
  }

  async renderUpload(req, res) {
    try {
      const videoDir = path.join(__dirname, '../../../frontend/public/videos');
      const courseFolders = fs.readdirSync(videoDir).filter(folder => {
        return fs.statSync(path.join(videoDir, folder)).isDirectory();
      });

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
  }

  async uploadVideo(req, res) {
    try {
      const { title, description, courseId, videoUrl } = req.body;

      if (!videoUrl) {
        return res.status(400).json({ error: 'No video URL provided' });
      }

      const videoId = Date.now().toString();
      const videoDoc = {
        _id: videoId,
        id: videoId,
        title,
        description,
        videoUrl,
        section: courseId,
        courseName: courseId,
        watched: false,
        watchedAt: null
      };

      // Save to DynamoDB/LocalStorage via the unified service
      const result = await dynamoVideoService.addVideoToCourse(courseId, videoDoc);
      
      if (result) {
        console.log(`Video saved to database: ${title}`);
        res.status(200).json({ success: true, redirectUrl: `/course/${courseId}` });
      } else {
        res.status(500).json({ error: 'Failed to save video to database' });
      }
    } catch (err) {
      console.error('Error processing upload:', err);
      res.status(500).json({ error: 'Error processing upload' });
    }
  }

  async uploadDirect(req, res) {
    try {
      const { title, description, courseId } = req.body;
      const videoFile = req.files?.video?.[0];
      const captionsFile = req.files?.captions?.[0];

      if (!videoFile) {
        return res.status(400).send('No video file uploaded');
      }

      const videoId = Date.now().toString();
      let videoUrl;

      if (videoFile.location) {
        // S3 upload
        videoUrl = videoFile.location;
      } else {
        // Local upload - maintain course folder structure
        const courseDir = path.join(__dirname, '../../../frontend/public/videos', courseId);
        if (!fs.existsSync(courseDir)) {
          fs.mkdirSync(courseDir, { recursive: true });
        }
        
        const fileName = `${Date.now()}-${videoFile.originalname}`;
        const finalPath = path.join(courseDir, fileName);
        
        // Move file to course directory
        fs.renameSync(videoFile.path, finalPath);
        
        // Store relative path from videos directory
        videoUrl = path.join(courseId, fileName).replace(/\\/g, '/');
      }

      const videoDoc = {
        _id: videoId,
        id: videoId,
        title,
        description,
        videoUrl,
        section: courseId,
        courseName: courseId,
        watched: false,
        watchedAt: null
      };

      // Save to DynamoDB/LocalStorage via the unified service
      const result = await dynamoVideoService.addVideoToCourse(courseId, videoDoc);
      
      if (result) {
        console.log(`Video uploaded: ${title} -> ${videoUrl}`);
        res.redirect(`/course/${encodeURIComponent(courseId)}`);
      } else {
        res.status(500).send('Failed to save uploaded video to database');
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      res.status(500).send('Error uploading file: ' + err.message);
    }
  }
}

module.exports = new UploadController();