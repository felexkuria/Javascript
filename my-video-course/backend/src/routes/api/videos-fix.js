const express = require('express');
const router = express.Router();
const Video = require('../../models/Video');

router.post('/fix-numbering', async (req, res) => {
  try {
    const courses = await Video.distinct('courseName');
    let totalUpdated = 0;
    
    for (const courseName of courses) {
      const videos = await Video.find({ courseName }).sort({ title: 1 });
      
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        const numberMatch = video.title.match(/(\d+)/);
        const lessonNumber = numberMatch ? parseInt(numberMatch[1]) : i + 1;
        
        await Video.updateOne(
          { _id: video._id },
          { 
            lessonNumber,
            sortOrder: lessonNumber
          }
        );
        totalUpdated++;
      }
    }

    res.json({ success: true, videosUpdated: totalUpdated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;