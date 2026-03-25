const express = require('express');
const router = express.Router();
const dynamoVideoService = require('../../services/dynamoVideoService');
const dynamodb = require('../../utils/dynamodb');
const uploadController = require('../../controllers/uploadController');
const teacherController = require('../../controllers/teacherController');

// ── Course Meta ────────────────────────────────────────────────

// Publish Course
router.patch('/courses/:id/publish', async (req, res) => {
  try {
    const { id } = req.params; // id is courseName
    const userId = req.user?.email || 'admin';
    
    const course = await dynamoVideoService.getCourseByTitle(id, userId);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    
    course.isPublished = true;
    await dynamodb.saveCourse(course);
    res.json({ success: true, isPublished: true });
  } catch (error) {
    console.error('Publish Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update Course Metadata
router.patch('/courses/:id/metadata', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category } = req.body;
    const userId = req.user?.email || 'admin';
    
    const course = await dynamoVideoService.getCourseByTitle(id, userId);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    
    if (title) {
        course.title = title;
        // In DynamoDB 'name' is the partition key, if it changes we might need a new record
        // But for now we just update the title field
    }
    if (description !== undefined) course.description = description;
    if (category) course.category = category;
    
    course.updatedAt = new Date().toISOString();
    await dynamodb.saveCourse(course);
    res.json({ success: true, course });
  } catch (error) {
    console.error('Metadata Update Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete Course
router.delete('/courses/:id', async (req, res) => {
  teacherController.deleteCourse(req, res);
});

// ── Sections & Lectures (Simplified for DynamoDB Flat List) ────

// Add Section (Mocked for flat list)
router.post('/courses/:id/sections', async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    const userId = req.user?.email || 'admin';
    
    const course = await dynamoVideoService.getCourseByTitle(id, userId);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    
    // In our flat list model, we don't have a separate sections array
    // We just return success to keep the frontend happy
    res.json({ success: true, message: 'Section added metadata-only' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add Lecture
router.post('/courses/:id/sections/:sectionId/lectures', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, type = 'video' } = req.body;
    const userId = req.user?.email || 'admin';
    
    const course = await dynamoVideoService.getCourseByTitle(id, userId);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const newLecture = { 
        _id: Date.now().toString(),
        title, 
        type, 
        section: req.params.sectionId,
        url: '',
        watched: false,
        createdAt: new Date().toISOString()
    };
    
    course.videos = course.videos || [];
    course.videos.push(newLecture);
    
    await dynamodb.saveCourse(course);
    res.json({ success: true, lecture: newLecture });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const videoProcessingService = require('../../services/videoProcessingService');

// Upload Lecture Video
router.post('/courses/:id/lectures/:lectureId/upload', upload.single('video'), async (req, res) => {
  try {
    const { id, lectureId } = req.params;
    const userId = req.user?.email || 'admin';
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const course = await dynamoVideoService.getCourseByTitle(id, userId);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const videoIndex = course.videos.findIndex(v => v._id === lectureId);
    if (videoIndex === -1) return res.status(404).json({ success: false, message: 'Lecture not found' });

    // Process and upload
    const result = await videoProcessingService.processVideo(file, course.title, course.videos[videoIndex].title);
    
    // Update lecture with s3Key
    course.videos[videoIndex].s3Key = result.s3Key;
    course.videos[videoIndex].url = result.id || 'uploaded';
    course.videos[videoIndex].videoUrl = result.id; // compat
    
    await dynamodb.saveCourse(course);

    res.json({ success: true, lecture: course.videos[videoIndex] });
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// General Upload
router.post('/courses/:courseId/upload', uploadController.upload.single('video'), (req, res) => {
  uploadController.uploadDirect(req, res);
});

module.exports = router;
