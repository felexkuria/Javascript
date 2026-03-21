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

module.exports = router;