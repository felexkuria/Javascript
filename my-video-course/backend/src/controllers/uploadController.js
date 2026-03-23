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

    // Enable S3 if bucket is configured
    if (process.env.S3_BUCKET_NAME) {
      console.log('✅ Using S3 storage for uploads:', process.env.S3_BUCKET_NAME);
      this.storage = multerS3({
        s3: this.s3,
        bucket: process.env.S3_BUCKET_NAME,
        acl: 'public-read',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
          const courseId = req.body.courseId || 'general';
          cb(null, `courses/${courseId}/${Date.now()}-${file.originalname}`);
        }
      });
    } else {
      console.log('⚠️ S3_BUCKET_NAME not set, using local storage.');
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
      const Course = require('../models/Course');
      const courses = await Course.find({}).lean();

      res.render('upload', {
        title: 'Upload Video',
        s3BucketName: process.env.S3_BUCKET_NAME || '',
        region: process.env.AWS_REGION || '',
        courses: courses // Pass MongoDB courses instead of folder names
      });
    } catch (err) {
      console.error('Error rendering upload page:', err);
      res.status(500).send('Server Error: ' + err.message);
    }
  }

  async uploadDirect(req, res) {
    try {
      const { title, description, courseId, sectionName = 'Default Section' } = req.body;
      const videoFile = req.files?.video?.[0];
      const Course = require('../models/Course');

      if (!videoFile) {
        return res.status(400).send('No video file uploaded');
      }

      const videoId = Date.now().toString();
      let videoUrl;
      let s3Key = null;

      if (videoFile.location) {
        // S3 upload (location is provided by multer-s3)
        videoUrl = videoFile.location;
        s3Key = videoFile.key;
      } else {
        // Local upload
        const courseDir = path.join(__dirname, '../../../frontend/public/videos', courseId);
        if (!fs.existsSync(courseDir)) {
          fs.mkdirSync(courseDir, { recursive: true });
        }
        
        const fileName = `${Date.now()}-${videoFile.originalname}`;
        const finalPath = path.join(courseDir, fileName);
        fs.renameSync(videoFile.path, finalPath);
        videoUrl = path.join(courseId, fileName).replace(/\\/g, '/');
      }

      // Update MongoDB Course model
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).send('Course not found in MongoDB');
      }

      // Find or create section
      let section = course.sections.find(s => s.title === sectionName);
      if (!section) {
        course.sections.push({ title: sectionName, lectures: [] });
        section = course.sections[course.sections.length - 1];
      }

      const newLecture = {
        title: title || videoFile.originalname,
        contentId: videoId,
        s3Key: s3Key,
        type: 'video',
        duration: 0 // Ideally we'd probe this
      };

      section.lectures.push(newLecture);
      course.totalVideos += 1;
      await course.save();

      console.log(`✅ MongoDB Update: Added lecture "${newLecture.title}" to course "${course.title}"`);
      res.redirect(`/course/${encodeURIComponent(course.slug)}`);
    } catch (err) {
      console.error('Error uploading file:', err);
      res.status(500).send('Error uploading file: ' + err.message);
    }
  }
}

module.exports = new UploadController();