const express = require('express');
const router = express.Router();
const Course = require('../../models/Course');
const uploadController = require('../../controllers/uploadController');
// Note: teacherOrAdminAuth is handled in app.js for this router
// ── Course Meta ────────────────────────────────────────────────

// Publish Course
router.patch('/courses/:id/publish', async (req, res) => {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { slug: id.toLowerCase().replace(/[^a-z0-9]+/g, '-') };
    
    const course = await Course.findOne(query);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    
    course.isPublished = true;
    await course.save({ validateBeforeSave: false });
    res.json({ success: true, isPublished: true });
  } catch (error) {
    console.error('Publish Error:', error);
    res.status(500).json({ success: false, message: error.message, error: error.message });
  }
});
// Update Course Metadata
router.patch('/courses/:id/metadata', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category } = req.body;
    
    const mongoose = require('mongoose');
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { slug: id.toLowerCase().replace(/[^a-z0-9]+/g, '-') };
    
    const course = await Course.findOne(query);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    
    if (title) {
        course.title = title;
        course.slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }
    if (description !== undefined) course.description = description;
    if (category) course.category = category;
    
    await course.save();
    res.json({ success: true, course });
  } catch (error) {
    console.error('Metadata Update Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


// Reorder Sections
router.patch('/courses/:id/reorder', async (req, res) => {
  try {
    const { id } = req.params;
    const { sectionIds } = req.body; 
    
    const mongoose = require('mongoose');
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { slug: id.toLowerCase().replace(/[^a-z0-9]+/g, '-') };
    
    const course = await Course.findOne(query);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    
    const newSections = [];
    sectionIds.forEach(sid => {
      const section = course.sections.id(sid);
      if (section) newSections.push(section);
    });
    
    course.sections.forEach(s => {
      if (!sectionIds.includes(s._id.toString())) newSections.push(s);
    });
    
    course.sections = newSections;
    await course.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, error: error.message });
  }
});

// ── Sections ──────────────────────────────────────────────────

// Add Section
router.post('/courses/:id/sections', async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    
    const mongoose = require('mongoose');
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { slug: id.toLowerCase().replace(/[^a-z0-9]+/g, '-') };
    
    const course = await Course.findOne(query);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    
    course.sections.push({ title, lectures: [] });
    await course.save();
    
    res.json({ success: true, sections: course.sections });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, error: error.message });
  }
});

// Update Section
router.patch('/courses/:id/sections/:sectionId', async (req, res) => {
  try {
    const { id, sectionId } = req.params;
    const { title } = req.body;
    
    const mongoose = require('mongoose');
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { slug: id.toLowerCase().replace(/[^a-z0-9]+/g, '-') };
    
    const course = await Course.findOne(query);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const section = course.sections.id(sectionId);
    if (!section) return res.status(404).json({ success: false, message: 'Section not found' });
    
    section.title = title;
    await course.save();
    
    res.json({ success: true, section });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, error: error.message });
  }
});

// Delete Section
router.delete('/courses/:id/sections/:sectionId', async (req, res) => {
  try {
    const { id, sectionId } = req.params;
    const mongoose = require('mongoose');
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { slug: id.toLowerCase().replace(/[^a-z0-9]+/g, '-') };
    
    const course = await Course.findOne(query);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    course.sections.pull(sectionId);
    await course.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, error: error.message });
  }
});

// ── Lectures ──────────────────────────────────────────────────

// Add Lecture
router.post('/courses/:id/sections/:sectionId/lectures', async (req, res) => {
  try {
    const { id, sectionId } = req.params;
    const { title, type = 'video' } = req.body;
    
    const mongoose = require('mongoose');
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { slug: id.toLowerCase().replace(/[^a-z0-9]+/g, '-') };
    
    const course = await Course.findOne(query);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const section = course.sections.id(sectionId);
    if (!section) return res.status(404).json({ success: false, message: 'Section not found' });
    
    section.lectures.push({ 
        title, 
        type, 
        contentId: 'pending', 
        isFree: false 
    });
    
    await course.save();
    res.json({ success: true, lecture: section.lectures[section.lectures.length - 1] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, error: error.message });
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

    const mongoose = require('mongoose');
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { slug: id.toLowerCase().replace(/[^a-z0-9]+/g, '-') };
    
    const course = await Course.findOne(query);
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
    res.status(500).json({ success: false, message: error.message, error: error.message });
  }
});

// Update Lecture Metadata (Rename)
router.patch('/courses/:id/sections/:sectionId/lectures/:lectureId', async (req, res) => {
  try {
    const { id, sectionId, lectureId } = req.params;
    const { title } = req.body;
    
    const mongoose = require('mongoose');
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { slug: id.toLowerCase().replace(/[^a-z0-9]+/g, '-') };
    
    const course = await Course.findOne(query);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const section = course.sections.id(sectionId);
    if (!section) return res.status(404).json({ success: false, message: 'Section not found' });
    
    const lecture = section.lectures.id(lectureId);
    if (!lecture) return res.status(404).json({ success: false, message: 'Lecture not found' });
    
    lecture.title = title;
    await course.save();
    res.json({ success: true, lecture });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, error: error.message });
  }
});

// General Upload (Video or Resource) into Section
router.post('/courses/:courseId/upload', uploadController.upload.single('video'), (req, res) => {
  uploadController.uploadDirect(req, res);
});

module.exports = router;
