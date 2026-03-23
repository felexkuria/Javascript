const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs');
const dynamoVideoService = require('../services/dynamoVideoService');
const thumbnailGenerator = require('../services/thumbnailGenerator');

/**
 * Sanitize a filename into a safe S3 key segment.
 * Strips everything except alphanumerics, dots, dashes, underscores.
 */
function sanitizeKey(name) {
  return name
    .replace(/\s+/g, '_')               // spaces → underscores
    .replace(/[^a-zA-Z0-9._\-]/g, '')   // remove all other unsafe chars
    .replace(/_{2,}/g, '_')             // collapse repeated underscores
    .toLowerCase()
    .substring(0, 180);                 // S3 key max 1024, keep reasonable
}

class UploadController {
  constructor() {
    this.setupStorage();
  }

  setupStorage() {
    this.s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

    if (process.env.S3_BUCKET_NAME) {
      console.log('✅ Using S3 storage for uploads:', process.env.S3_BUCKET_NAME);
      this.storage = multerS3({
        s3: this.s3,
        bucket: process.env.S3_BUCKET_NAME,
        // ⚠️  DO NOT set acl: 'public-read' — it breaks on buckets with
        //     Object Ownership set to "Bucket owner enforced" (ACLs disabled).
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
          const courseId = sanitizeKey(req.params.courseId || req.body.courseId || 'general');
          const sectionId = sanitizeKey(req.body.sectionId || 'default-section');
          const type = file.mimetype.startsWith('video/') ? 'videos' : 'resources';
          const safeName = sanitizeKey(file.originalname);
          const key = `courses/${courseId}/sections/${sectionId}/${type}/${Date.now()}-${safeName}`;
          cb(null, key);
        }
      });
    } else {
      console.log('⚠️ S3_BUCKET_NAME not set, using local storage.');
      const uploadsDir = path.join(__dirname, '../../../frontend/public/uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      this.storage = multer.diskStorage({
        destination: function (req, file, cb) { cb(null, uploadsDir); },
        filename: function (req, file, cb) {
          cb(null, Date.now() + '-' + sanitizeKey(file.originalname));
        }
      });
    }

    this.upload = multer({
      storage: this.storage,
      limits: { fileSize: 1000 * 1024 * 1024 }, // 1 GB
      fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('video/') || file.mimetype === 'application/pdf') {
          cb(null, true);
        } else {
          cb(new Error('Only video and PDF files are allowed'));
        }
      }
    });

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
        courses
      });
    } catch (err) {
      console.error('Error rendering upload page:', err);
      res.status(500).send('Server Error: ' + err.message);
    }
  }

  async uploadDirect(req, res) {
    try {
      const { title, description, sectionName = 'Default Section' } = req.body;
      // Support both route param and body for courseId
      const courseId = req.params.courseId || req.body.courseId;
      const sectionId = req.body.sectionId;
      const videoFile = req.files?.video?.[0];
      const Course = require('../models/Course');

      if (!videoFile) {
        return res.status(400).json({ success: false, message: 'No video file uploaded' });
      }

      const videoIdStr = Date.now().toString();
      let videoUrl;
      let s3Key = null;

      if (videoFile.location) {
        // S3 upload — location populated by multer-s3
        videoUrl = videoFile.location;
        s3Key = videoFile.key;
      } else {
        // Local disk upload
        const courseDir = path.join(__dirname, '../../../frontend/public/videos', courseId || 'general');
        if (!fs.existsSync(courseDir)) fs.mkdirSync(courseDir, { recursive: true });
        const fileName = `${Date.now()}-${sanitizeKey(videoFile.originalname)}`;
        const finalPath = path.join(courseDir, fileName);
        fs.renameSync(videoFile.path, finalPath);
        videoUrl = path.join(courseId || 'general', fileName).replace(/\\/g, '/');
      }

      // ── Link into MongoDB section ─────────────────────────────
      const course = await Course.findById(courseId).catch(() => null);
      if (!course) {
        return res.status(404).json({ success: false, message: 'Course not found in MongoDB' });
      }

      const newLecture = {
        title: title || videoFile.originalname,
        contentId: videoIdStr,
        s3Key,
        type: 'video',
        duration: 0,
        isFree: false
      };

      if (sectionId) {
        // Push into specific section by _id
        const idx = course.sections.findIndex(s => s._id.toString() === sectionId);
        if (idx !== -1) {
          course.sections[idx].lectures.push(newLecture);
        } else {
          course.sections.push({ title: sectionName, lectures: [newLecture] });
        }
      } else {
        // Find or create by title
        let section = course.sections.find(s => s.title === sectionName);
        if (!section) {
          course.sections.push({ title: sectionName, lectures: [] });
          section = course.sections[course.sections.length - 1];
        }
        section.lectures.push(newLecture);
      }

      course.totalVideos = (course.totalVideos || 0) + 1;
      await course.save();

      console.log(`✅ MongoDB: Added lecture "${newLecture.title}" to course "${course.title}"`);

      // Respond appropriately
      if (req.accepts('json')) {
        return res.json({ success: true, data: { videoUrl, s3Key, videoId: videoIdStr }, message: 'Video uploaded successfully' });
      }
      res.redirect(`/course/${encodeURIComponent(course.slug || course.title)}`);
    } catch (err) {
      console.error('Error uploading file:', err);
      if (req.accepts('json')) {
        return res.status(500).json({ success: false, message: 'Error uploading file: ' + err.message });
      }
      res.status(500).send('Error uploading file: ' + err.message);
    }
  }
}

module.exports = new UploadController();