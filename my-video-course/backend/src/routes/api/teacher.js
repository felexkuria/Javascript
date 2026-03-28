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

// Add Section
router.post('/courses/:id/sections', async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    const userId = req.user?.email || 'admin';
    
    const course = await dynamoVideoService.getCourseByTitle(id, userId);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    
    const newSection = {
      _id: Date.now().toString(),
      title,
      lectures: []
    };

    course.sections = course.sections || [];
    course.sections.push(newSection);
    
    await dynamodb.saveCourse(course);
    res.json({ success: true, section: newSection });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Rename Section
router.patch('/courses/:id/sections/:sectionId', async (req, res) => {
  try {
    const { id, sectionId } = req.params;
    const { title } = req.body;
    const userId = req.user?.email || 'admin';
    
    const course = await dynamoVideoService.getCourseByTitle(id, userId);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    
    const sectionIndex = (course.sections || []).findIndex(s => s._id === sectionId || s.sectionId === sectionId || s.id === sectionId);
    if (sectionIndex === -1) return res.status(404).json({ success: false, message: 'Section not found' });
    
    course.sections[sectionIndex].title = title;
    await dynamodb.saveCourse(course);
    res.json({ success: true, message: 'Section renamed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete Section
router.delete('/courses/:id/sections/:sectionId', async (req, res) => {
  try {
    const { id, sectionId } = req.params;
    const userId = req.user?.email || 'admin';
    
    const course = await dynamoVideoService.getCourseByTitle(id, userId);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    
    course.sections = (course.sections || []).filter(s => s._id !== sectionId);
    await dynamodb.saveCourse(course);
    res.json({ success: true, message: 'Section deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// Add Lecture
router.post('/courses/:id/sections/:sectionId/lectures', async (req, res) => {
  try {
    const { id, sectionId } = req.params;
    const { title, type = 'video' } = req.body;
    const userId = req.user?.email || 'admin';
    
    const course = await dynamoVideoService.getCourseByTitle(id, userId);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const newLecture = { 
        _id: Date.now().toString(),
        title, 
        type, 
        sectionId: sectionId, // Ensure consistency with frontend
        url: '',
        watched: false,
        createdAt: new Date().toISOString()
    };
    
    // 1. Add to Legacy Flat List for playback compatibility
    course.videos = course.videos || [];
    const flatLecture = { ...newLecture, courseName: id, section: sectionId };
    course.videos.push(flatLecture); 
    
    // 2. Add to Nested Sections for Editor compatibility
    const sectionIndex = (course.sections || []).findIndex(s => s._id === sectionId || s.sectionId === sectionId || s.id === sectionId);
    if (sectionIndex !== -1) {
        course.sections[sectionIndex].lectures = course.sections[sectionIndex].lectures || [];
        course.sections[sectionIndex].lectures.push(newLecture);
    }
    
    // 3. Persist to Both Tables
    await dynamodb.saveCourse(course);
    await dynamodb.saveVideo(flatLecture); // STANDALONE TABLE

    res.json({ success: true, lecture: newLecture });
  } catch (error) {

    res.status(500).json({ success: false, message: error.message });
  }
});

// Rename Lecture
router.patch('/courses/:id/sections/:sectionId/lectures/:lectureId', async (req, res) => {
  try {
    const { id, sectionId, lectureId } = req.params;
    const { title } = req.body;
    const userId = req.user?.email || 'admin';
    
    const course = await dynamoVideoService.getCourseByTitle(id, userId);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    
    // Update in Sections
    const sectionIndex = (course.sections || []).findIndex(s => s._id === sectionId || s.sectionId === sectionId || s.id === sectionId);
    if (sectionIndex !== -1) {
        const lectureIndex = (course.sections[sectionIndex].lectures || []).findIndex(l => l._id === lectureId || l.videoId === lectureId || l.id === lectureId);
        if (lectureIndex !== -1) course.sections[sectionIndex].lectures[lectureIndex].title = title;
    }
    
    // Update in flat list
    const videoIndex = (course.videos || []).findIndex(v => v._id === lectureId || v.videoId === lectureId || v.id === lectureId);
    if (videoIndex !== -1) {
        course.videos[videoIndex].title = title;
        // Also update in standalone table
        await dynamodb.saveVideo({ 
            ...course.videos[videoIndex], 
            courseName: id,
            videoId: lectureId,
            title 
        });
    }

    await dynamodb.saveCourse(course);

    res.json({ success: true, message: 'Lecture renamed' });
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

    const videoIndex = course.videos.findIndex(v => v._id === lectureId || v.videoId === lectureId || v.id === lectureId);
    if (videoIndex === -1) return res.status(404).json({ success: false, message: 'Lecture not found' });

    // Process and upload
    const result = await videoProcessingService.processVideo(file, course.title, course.videos[videoIndex].title);
    
    // Update lecture with s3Key
    // Update lecture with s3Key and valid URL
    course.videos[videoIndex].s3Key = result.s3Key;
    course.videos[videoIndex].videoUrl = result.videoUrl;
    course.videos[videoIndex].url = result.videoUrl; // compatibility
    
    // Also update in the nested sections structure
    const sectionId = course.videos[videoIndex].section;
    const sIdx = (course.sections || []).findIndex(s => s._id === sectionId || s.sectionId === sectionId || s.id === sectionId);
    if (sIdx !== -1) {
        const lIdx = (course.sections[sIdx].lectures || []).findIndex(l => l._id === lectureId || l.videoId === lectureId || l.id === lectureId);
        if (lIdx !== -1) {
            course.sections[sIdx].lectures[lIdx].s3Key = result.s3Key;
            course.sections[sIdx].lectures[lIdx].videoUrl = result.videoUrl;
            course.sections[sIdx].lectures[lIdx].url = result.videoUrl;
        }
    }

    await dynamodb.saveCourse(course);
    await dynamodb.saveVideo({ ...course.videos[videoIndex], courseName: id, videoId: lectureId });


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
