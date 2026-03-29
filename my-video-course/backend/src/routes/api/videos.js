const express = require('express');
const router = express.Router();
const videoController = require('../../controllers/videoController');
const sessionAuth = require('../../middleware/sessionAuth');

router.get('/', sessionAuth, videoController.getAllVideos);
router.get('/course/:courseName', sessionAuth, videoController.getVideosByCourse);
router.get('/course/:courseName/count', sessionAuth, videoController.getVideoCount);
router.get('/watch-dates', sessionAuth, videoController.getWatchDates);
router.get('/status/:videoId', sessionAuth, videoController.getVideoStatus);
router.get('/:courseName/:videoId', sessionAuth, videoController.getVideo);
router.post('/:courseName/:videoId/watch', sessionAuth, videoController.markWatched);
router.post('/sync', sessionAuth, videoController.syncVideos);
router.post('/add', sessionAuth, videoController.addVideo);

// localStorage endpoint for gamification (User specific)
router.get('/localStorage', sessionAuth, async (req, res) => {
  try {
    const userId = req.user?.email || req.session?.user?.email || 'guest';
    const dynamoVideoService = require('../../services/dynamoVideoService');
    const courses = await dynamoVideoService.getAllCourses(userId);
    
    const localStorageFormat = {};
    courses.forEach(course => {
      localStorageFormat[course.name] = {
        videos: course.videos || []
      };
    });
    
    res.json(localStorageFormat);
  } catch (error) {
    console.error('Error getting localStorage format:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stream URL endpoint for video player fallback
router.post('/stream-url', async (req, res) => {
  try {
    const { videoKey } = req.body;
    
    // Generate signed URL using AWS SDK
    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    
    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME || 'video-course-app-video-bucket-prod-6m5k2til',
      Key: videoKey
    });
    
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    
    res.json({ success: true, streamUrl: signedUrl });
  } catch (error) {
    console.error('Error generating stream URL:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;