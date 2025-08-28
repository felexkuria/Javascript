const express = require('express');
const router = express.Router();
const courseController = require('../../controllers/courseController');

router.get('/', courseController.getAllCourses);
router.post('/', courseController.createCourse);
router.get('/:name', courseController.getCourseByName);
router.post('/upload-video', courseController.upload.single('video'), courseController.uploadVideo);

module.exports = router;