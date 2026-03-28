const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const dynamodb = require('../../utils/dynamodb');
const cognitoAuth = require('../../middleware/cognitoAuth');
const s3Signer = require('../../utils/s3Signer');

const router = express.Router();
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // Reduced limit for legacy/small files
});

const sanitize = (s) => {
  if (!s) return 'untitled';
  // Lowercase and replace spaces with underscores
  // Then remove any characters NOT in [a-z0-9._-]
  const sanitized = s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9._-]/g, '');
  // Ensure we never return an empty string to avoid malformed S3 keys (e.g., videos//...)
  return sanitized || 'untitled_' + Date.now().toString(36);
};

// Upload video endpoint
router.post('/video', cognitoAuth, upload.single('video'), async (req, res) => {
  try {
    const { courseName, videoTitle, description } = req.body;
    const file = req.file;
    
    if (!file || !courseName || !videoTitle) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }

    // Upload to S3
    const videoKey = `videos/${courseName}/${videoTitle}.mp4`;
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: videoKey,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        courseName,
        videoTitle,
        uploadedBy: req.user.email,
        uploadedAt: new Date().toISOString()
      }
    });

    await s3.send(command);
    
    // Save video record to DynamoDB
    const videoData = {
      _id: Date.now().toString(),
      title: videoTitle,
      courseName,
      description,
      s3Key: videoKey,
      videoUrl: `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${videoKey}`,
      uploadedBy: req.user.email,
      createdAt: new Date().toISOString(),
      captionsReady: false,
      quizReady: false,
      summaryReady: false,
      processing: true
    };
    
    await dynamodb.saveVideo(videoData);

    // Background processing would go here
    console.log('Video uploaded, processing can be added later');

    res.json({
      success: true,
      message: 'Video uploaded successfully. Processing captions and quiz...',
      data: {
        videoTitle,
        courseName,
        s3Key: videoKey,
        processing: true
      }
    });

  } catch (error) {
    console.error('Upload failed:', error);
    res.status(500).json({
      success: false,
      message: 'Upload failed',
      error: error.message
    });
  }
});

// Check processing status
router.get('/status/:courseName/:videoTitle', cognitoAuth, async (req, res) => {
  try {
    const { courseName, videoTitle } = req.params;
    
    const videos = await dynamodb.getVideosForCourse(courseName);
    const video = videos?.find(v => v.title === videoTitle);
    
    if (video) {
      return res.json({
        success: true,
        data: {
          processing: video.processing || false,
          captionsReady: video.captionsReady || false,
          quizReady: video.quizReady || false,
          summaryReady: video.summaryReady || false,
          processedAt: video.processedAt,
          error: video.processingError
        }
      });
    }
    
    res.status(404).json({
      success: false,
      message: 'Video not found'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Status check failed',
      error: error.message
    });
  }
});

// 🛰️ Phase 2: Decoupled Ingestion
// Step 1: Request Presigned URL
router.post('/request-presigned-url', cognitoAuth, async (req, res) => {
  try {
    const { courseName, videoTitle, contentType } = req.body;
    if (!courseName || !videoTitle || !contentType) {
      return res.status(400).json({ success: false, message: 'Missing metadata' });
    }

    const safeCourse = sanitize(courseName);
    const safeTitle = sanitize(videoTitle);

    const videoKey = `videos/${safeCourse}/${Date.now()}-${safeTitle}.mp4`;
    const result = await s3Signer.getPresignedUploadUrl(videoKey, contentType);

    if (result.success) {
      res.json({ success: true, url: result.url, key: result.key });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Step 2: Complete Upload (Register in DynamoDB)
router.post('/complete', cognitoAuth, async (req, res) => {
  try {
    const { courseName, videoTitle, description, s3Key } = req.body;
    
    if (!s3Key || !courseName || !videoTitle) {
      return res.status(400).json({ success: false, message: 'Missing completion data' });
    }


    const safeCourse = sanitize(courseName);

    const videoData = {
      _id: Date.now().toString(),
      title: videoTitle,
      courseName,
      description: description || '',
      s3Key,
      videoUrl: `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`,
      uploadedBy: req.user.email,
      createdAt: new Date().toISOString(),
      captionsReady: false,
      quizReady: false,
      summaryReady: false,
      processing: true
    };
    
    await dynamodb.saveVideo(videoData);

    // Trigger async processing (Stage 5)
    // Note: In Stage 5, this will be handled by S3 Event Notifications
    const videoUploadProcessor = require('../../services/videoUploadProcessor');
    videoUploadProcessor.processUploadedVideo(
      process.env.S3_BUCKET_NAME, 
      s3Key, 
      videoTitle, 
      courseName
    ).catch(err => console.error('Processing trigger failed:', err));

    res.json({ success: true, message: 'Upload registered. Processing started.', data: videoData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;