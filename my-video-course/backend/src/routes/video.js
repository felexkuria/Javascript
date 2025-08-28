const express = require('express');
const router = express.Router();
const videoController = require('../controllers/videoController');

router.get('/', videoController.getAllVideos);
router.get('/:id', videoController.getVideoById);
router.post('/:id/watch', videoController.markVideoAsWatched);
// Dashboard route removed - handled in app.js

module.exports = router;
