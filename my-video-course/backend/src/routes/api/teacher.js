const express = require('express');
const router = express.Router();
const Course = require('../../models/Course');
const teacherOrAdminAuth = require('../../middleware/cognitoAuth'); // Adjust based on actual middleware name

// ── Sections ──────────────────────────────────────────────────

// Add Section
router.post('/courses/:id/sections', async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    
    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    
    course.sections.push({ title, lectures: [] });
    await course.save();
    
    res.json({ success: true, sections: course.sections });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Section
router.patch('/courses/:id/sections/:sectionId', async (req, res) => {
  try {
    const { id, sectionId } = req.params;
    const { title } = req.body;
    
    const course = await Course.findById(id);
    const section = course.sections.id(sectionId);
    if (!section) return res.status(404).json({ success: false, message: 'Section not found' });
    
    section.title = title;
    await course.save();
    
    res.json({ success: true, section });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete Section
router.delete('/courses/:id/sections/:sectionId', async (req, res) => {
  try {
    const { id, sectionId } = req.params;
    const course = await Course.findById(id);
    course.sections.pull(sectionId);
    await course.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Lectures ──────────────────────────────────────────────────

// Add Lecture
router.post('/courses/:id/sections/:sectionId/lectures', async (req, res) => {
  try {
    const { id, sectionId } = req.params;
    const { title, type = 'video' } = req.body;
    
    const course = await Course.findById(id);
    const section = course.sections.id(sectionId);
    if (!section) return res.status(404).json({ success: false, message: 'Section not found' });
    
    section.lectures.push({ 
        title, 
        type, 
        contentId: 'pending', // Placeholder until video is uploaded
        isFree: false 
    });
    
    await course.save();
    res.json({ success: true, lecture: section.lectures[section.lectures.length - 1] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const videoProcessingService = require('../../services/videoProcessingService');

// Upload Lecture Video
router.post('/courses/:id/lectures/:lectureId/upload', upload.single('video'), async (req, res) => {
  try {
    const { id, lectureId } = req.params;
    const { title } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    // Find the lecture in any section
    let targetedLecture = null;
    course.sections.forEach(sec => {
      const l = sec.lectures.id(lectureId);
      if (l) targetedLecture = l;
    });

    if (!targetedLecture) return res.status(404).json({ success: false, message: 'Lecture not found' });

    // Process and upload
    const result = await videoProcessingService.processVideo(file, course.title, targetedLecture.title);
    
    // Update lecture with s3Key
    targetedLecture.s3Key = result.s3Key;
    targetedLecture.contentId = result.id || 'uploaded';
    await course.save();

    res.json({ success: true, lecture: targetedLecture });
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
