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
    .replace(/[^a-zA-Z0-9._-]/g, '')   // remove all other unsafe chars
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
      const courses = await dynamoVideoService.getAllCourses('admin');
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
      const courseId = req.params.courseId || req.body.courseId; // This is courseName for DynamoDB
      const sectionId = req.body.sectionId;
      const type = req.body.type || 'video';
      const file = req.file || req.files?.video?.[0] || req.files?.file?.[0];

      if (!file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const videoIdStr = Date.now().toString();
      let videoUrl;
      let s3Key = null;

      if (file.location) {
        // S3 upload — location populated by multer-s3
        videoUrl = file.location;
        s3Key = file.key;
      } else {
        // Local disk upload
        const courseDir = path.join(__dirname, '../../../frontend/public/videos', courseId || 'general');
        if (!fs.existsSync(courseDir)) fs.mkdirSync(courseDir, { recursive: true });
        const fileName = `${Date.now()}-${sanitizeKey(file.originalname)}`;
        const finalPath = path.join(courseDir, fileName);
        fs.renameSync(file.path, finalPath);
        videoUrl = path.join(courseId || 'general', fileName).replace(/\\/g, '/');
      }

      // ── Link into DynamoDB ─────────────────────────────
      const courseName = courseId || 'general';
      const videoData = {
        _id: videoIdStr,
        title: title || file.originalname,
        description: description || '',
        url: videoUrl,
        videoUrl: videoUrl, // Legacy compat
        s3Key: s3Key,
        type: type,
        section: sectionName,
        duration: 0,
        watched: false,
        createdAt: new Date().toISOString()
      };

      await dynamoVideoService.addVideoToCourse(courseName, videoData);
      console.log(`✅ DynamoDB: Added lecture "${videoData.title}" to course "${courseName}"`);

      // Respond appropriately
      if (req.accepts('json')) {
        return res.json({ success: true, data: { videoUrl, s3Key, videoId: videoIdStr }, message: 'Video uploaded successfully' });
      }
      res.redirect(`/dashboard`);
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