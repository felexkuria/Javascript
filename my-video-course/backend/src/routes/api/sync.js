const express = require('express');
const router = express.Router();
const s3SyncService = require('../../services/s3SyncService');

router.post('/s3-to-dynamodb', async (req, res) => {
  try {
    const syncCount = await s3SyncService.syncS3ToDynamoDB();
    res.json({ 
      success: true, 
      message: `Synced ${syncCount} videos from S3 to DynamoDB`,
      syncCount 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/repair-manifest', async (req, res) => {
  try {
    const { courseName } = req.body;
    if (!courseName) return res.status(400).json({ success: false, message: 'courseName is required' });
    
    const result = await s3SyncService.verifyManifest(courseName);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;