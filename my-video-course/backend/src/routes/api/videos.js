const express = require('express');
const router = express.Router();
const videoController = require('../../controllers/videoController');

router.get('/', videoController.getAllVideos);
router.get('/course/:courseName', videoController.getVideosByCourse);
router.get('/course/:courseName/count', videoController.getVideoCount);
router.get('/:courseName/:videoId', videoController.getVideo);
router.post('/:courseName/:videoId/watch', videoController.markWatched);
router.post('/sync', videoController.syncVideos);
router.post('/add', videoController.addVideo);

module.exports = router;