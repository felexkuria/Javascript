const express = require('express');
const router = express.Router();
const videoController = require('../controllers/videoController');

router.get('/', videoController.getAllVideos);
router.get('/:id', videoController.getVideoById);
router.post('/:id/watch', videoController.markVideoAsWatched);
// GET dashboard page
router.get('/dashboard', (req, res) => {
    // Render the dashboard.ejs template
    res.render('dashboard');
  });

module.exports = router;
