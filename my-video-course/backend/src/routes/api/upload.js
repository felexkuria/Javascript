const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const dynamodb = require('../../utils/dynamodb');
const cognitoAuth = require('../../middleware/cognitoAuth');
const s3Signer = require('../../utils/s3Signer');
const s3Utils = require('../../utils/s3Utils');


const router = express.Router();
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // Reduced limit for legacy/small files
});

const sanitize = (s) => s3Utils.sanitizeKey(s);

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
router.post('/request-presigned-url', async (req, res) => {
  try {
    const { courseName, videoTitle, contentType } = req.body;
    if (!courseName || !videoTitle || !contentType) {
      return res.status(400).json({ success: false, message: 'Missing metadata' });
    }

    const safeCourse = sanitize(courseName);
    const safeTitle = sanitize(videoTitle);
    
    // 🔍 Intelligent Extension Detection
    let ext = '.mp4';
    if (contentType === 'application/pdf') {
      ext = '.pdf';
    } else if (contentType === 'text/vtt' || videoTitle.toLowerCase().endsWith('.vtt')) {
      ext = '.vtt';
    } else if (contentType === 'application/x-subrip' || videoTitle.toLowerCase().endsWith('.srt')) {
      ext = '.srt';
    } else if (contentType.startsWith('video/')) {
      ext = '.mp4';
    } else {
      // Final fallback: use the extension from the original title if available
      const lastDot = videoTitle.lastIndexOf('.');
      if (lastDot > 0) {
        ext = videoTitle.substring(lastDot).toLowerCase();
      }
    }

    const videoKey = `videos/${safeCourse}/${Date.now()}-${safeTitle}${ext}`;
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
router.post('/complete', async (req, res) => {
  try {
    const { courseName, videoTitle, description, s3Key, lectureId } = req.body;
    
    if (!s3Key || !courseName || !videoTitle) {
      return res.status(400).json({ success: false, message: 'Missing completion data' });
    }

    const safeCourse = sanitize(courseName);

    // 🏷️ Category Selection (Standardized for Iconography)
    let contentType = 'video';
    if (s3Key.toLowerCase().endsWith('.pdf')) {
      contentType = 'pdf'; 
    } else if (s3Key.toLowerCase().endsWith('.srt') || s3Key.toLowerCase().endsWith('.vtt')) {
      contentType = 'caption';
    } else if (!s3Key.toLowerCase().endsWith('.mp4')) {
      contentType = 'resource';
    }


    const videoData = {
      _id: (lectureId || Date.now()).toString(), // 🏗️ Use existing ID if available to prevent duplicates
      title: videoTitle,
      courseName,
      description: description || '',
      s3Key,
      videoUrl: `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`,
      uploadedBy: req.user?.email || 'unknown',
      type: contentType,
      createdAt: new Date().toISOString(),
      captionsReady: false,
      quizReady: false,
      summaryReady: false,
      processing: contentType === 'video'
    };
    
    // 🛰️ Dual-Sync Architecture: Update Standalone Videos and Course Curriculum
    await dynamodb.saveVideo(videoData);

    try {
      // 🏗️ ID-Locked Persistence: Lookup by the unique Partition Key
      const course = await dynamodb.getCourse(courseName);
      if (course) {
        let updated = false;
        
        // 🧪 ID-First Matcher: The most reliable way to link ingestion to specific slots
        if (course.sections) {
          for (const section of course.sections) {
            const lecture = (section.lectures || []).find(l => {
              const lid = (l.videoId || l._id || l.id || '').toString();
              return (lectureId && lid === lectureId.toString()) || 
                     (l.title.toLowerCase().trim() === videoTitle.toLowerCase().trim());
            });

            if (lecture) {
              lecture.s3Key = s3Key;
              lecture.videoUrl = videoData.videoUrl;
              lecture.url = videoData.videoUrl;
              lecture.type = videoData.type;
              updated = true;
            }
          }
        }

        // Parallel update in the flat legacy list for playback compatibility
        if (course.videos) {
            const vIdx = course.videos.findIndex(v => v.title === videoTitle || v._id === videoData._id);
            if (vIdx !== -1) {
                course.videos[vIdx].s3Key = s3Key;
                course.videos[vIdx].videoUrl = videoData.videoUrl;
                course.videos[vIdx].type = videoData.type;
                updated = true;
            } else if (!updated) {
                // Failover: append to flat list if no existing slot was linked
                course.videos.push({ ...videoData, section: course.sections?.[0]?.title || 'Uncategorized' });
                updated = true;
            }
        }

        if (updated) {
          await dynamodb.saveCourse(course);
          console.log(`✅ Persisted Sync: [${videoTitle}] is now permanently linked to Course [${courseName}]`);
        }
      }

    } catch (syncErr) {
      console.warn(`⚠️  Course sync skipped: ${syncErr.message}`);
    }

    // Trigger async processing (Stage 5)
    const videoUploadProcessor = require('../../services/videoUploadProcessor');
    if (videoData.processing) {
      videoUploadProcessor.processUploadedVideo(
        process.env.S3_BUCKET_NAME, 
        s3Key, 
        videoTitle, 
        courseName
      ).catch(err => console.error('Processing trigger failed:', err));
    }

    res.json({ success: true, message: 'Upload registered. Processing started.', data: videoData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;