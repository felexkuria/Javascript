const express = require('express');
const router = express.Router();
const Video = require('../../models/Video');

router.get('/no-s3-url', async (req, res) => {
  try {
    const videos = await Video.find({
      $or: [
        { videoUrl: { $exists: false } },
        { videoUrl: null },
        { videoUrl: '' }
      ]
    }).select('title courseName _id').limit(50);

    res.json({ success: true, data: videos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/update-s3-url/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { videoUrl } = req.body;

    if (!videoUrl) {
      return res.status(400).json({ success: false, error: 'Video URL required' });
    }

    const video = await Video.findByIdAndUpdate(
      id,
      { videoUrl },
      { new: true }
    );

    if (!video) {
      return res.status(404).json({ success: false, error: 'Video not found' });
    }

    res.json({ success: true, data: video });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;