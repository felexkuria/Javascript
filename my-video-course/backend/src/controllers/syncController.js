const dynamoVideoService = require('../services/dynamoVideoService');
const gamificationManager = require('../services/gamificationManager');
const dynamoService = require('../services/dynamoService');
const { spawn } = require('child_process');
const path = require('path');

class SyncController {
  async syncAllStorages(req, res) {
    try {
      console.log('Starting comprehensive data sync across all storage systems...');
      
      const results = {
        localStorage: { status: 'success', courses: 0, videos: 0 },
        dynamodb: { status: 'unavailable', courses: 0, videos: 0, synced: 0 },
        errors: []
      };

      // Get data from localStorage
      // Sync with DynamoDB (Primary)
      try {
        for (const courseName of courseNames) {
          const localVideos = localStorage[courseName] || [];
          if (localVideos.length === 0) continue;
          
          const dynamoVideos = await dynamoService.getVideosForCourse(courseName);
          
          for (const localVideo of localVideos) {
            if (!localVideo?._id) continue;
            
            const dynamoId = localVideo._id.toString();
            const dynamoVideo = dynamoVideos.find(v => (v.id || v._id || '').toString() === dynamoId);
            
            if (!dynamoVideo || dynamoVideo.watched !== localVideo.watched) {
              const dynamoData = {
                id: dynamoId,
                _id: dynamoId,
                title: localVideo.title,
                videoUrl: localVideo.videoUrl,
                watched: localVideo.watched || false,
                watchedAt: localVideo.watchedAt,
                chapter: localVideo.chapter,
                thumbnailUrl: localVideo.thumbnailUrl,
                isYouTube: localVideo.isYouTube || false,
                courseName: courseName
              };
              
              await dynamoService.saveVideo(courseName, dynamoData);
              results.dynamodb.synced++;
            }
          }
          
          results.dynamodb.courses++;
          results.dynamodb.videos += localVideos.length;
        }
        
        results.dynamodb.status = 'success';
      } catch (dynamoError) {
        results.dynamodb.status = 'error';
        results.errors.push(`DynamoDB: ${dynamoError.message}`);
      }

      // Sync with DynamoDB
      try {
        for (const courseName of courseNames) {
          const localVideos = localStorage[courseName] || [];
          if (localVideos.length === 0) continue;
          
          const dynamoVideos = await dynamoService.getVideosForCourse(courseName);
          
          for (const localVideo of localVideos) {
            if (!localVideo?._id) continue;
            
            const dynamoVideo = dynamoVideos.find(v => v.id === localVideo._id.toString());
            if (!dynamoVideo || dynamoVideo.watched !== localVideo.watched) {
              const dynamoData = {
                id: localVideo._id.toString(),
                title: localVideo.title,
                videoUrl: localVideo.videoUrl,
                watched: localVideo.watched || false,
                watchedAt: localVideo.watchedAt,
                chapter: localVideo.chapter,
                thumbnailUrl: localVideo.thumbnailUrl,
                isYouTube: localVideo.isYouTube || false
              };
              
              await dynamoService.saveVideo(courseName, dynamoData);
              results.dynamodb.synced++;
            }
          }
          
          results.dynamodb.courses++;
          results.dynamodb.videos += localVideos.length;
        }
        
        results.dynamodb.status = 'success';
      } catch (dynamoError) {
        results.dynamodb.status = 'error';
        results.errors.push(`DynamoDB: ${dynamoError.message}`);
      }

      const summary = {
        success: true,
        message: 'Data sync completed across all storage systems',
        timestamp: new Date().toISOString(),
        results,
        totalErrors: results.errors.length
      };

      res.json(summary);
      
    } catch (error) {
      console.error('Comprehensive sync error:', error);
      res.status(500).json({
        success: false,
        error: 'Comprehensive sync failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async syncCourse(req, res) {
    try {
      const { courseName } = req.body;

      if (!courseName) {
        return res.status(400).json({ error: 'Missing courseName', success: false });
      }

      const localStorage = dynamoVideoService.getLocalStorage();
      if (!localStorage[courseName]) {
        return res.status(404).json({ error: `Course ${courseName} not found in localStorage`, success: false });
      }

      const localVideos = localStorage[courseName];
      const dynamoVideos = await dynamoService.getVideosForCourse(courseName);

      let syncedCount = 0;
      let addedCount = 0;
      let updatedCount = 0;

      for (const localVideo of localVideos) {
        if (!localVideo || !localVideo._id) continue;

        const dynamoId = localVideo._id.toString();
        const dynamoVideo = dynamoVideos.find(v => (v.id || v._id || '').toString() === dynamoId);

        if (dynamoVideo) {
          if (dynamoVideo.watched !== localVideo.watched ||
            dynamoVideo.watchedAt !== localVideo.watchedAt) {
            
            const dynamoData = {
              ...dynamoVideo,
              watched: localVideo.watched || false,
              watchedAt: localVideo.watchedAt || null,
              id: dynamoId,
              _id: dynamoId
            };
            await dynamoService.saveVideo(courseName, dynamoData);
            updatedCount++;
          }
          syncedCount++;
        } else {
          try {
            const dynamoData = {
              ...localVideo,
              id: dynamoId,
              _id: dynamoId,
              courseName: courseName
            };
            await dynamoService.saveVideo(courseName, dynamoData);
            addedCount++;
          } catch (insertErr) {
            console.warn(`Failed to insert video ${localVideo.title} to DynamoDB:`, insertErr.message);
          }
        }
      }

      const message = `Sync completed: ${syncedCount} matched, ${updatedCount} updated, ${addedCount} added to DynamoDB`;

      res.status(200).json({
        success: true,
        message,
        syncedCount,
        updatedCount,
        addedCount,
        totalLocal: localVideos.length,
        totalDynamoDB: dynamoVideos.length
      });
    } catch (err) {
      console.error('Error syncing course:', err);
      res.status(500).json({ error: 'Error syncing course: ' + err.message, success: false });
    }
  }

  async sync(req, res) {
    try {
      const syncProcess = spawn('node', ['sync-data.js'], {
        cwd: path.join(__dirname, '../../../'),
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';

      syncProcess.stdout.on('data', (data) => {
        output += data.toString();
        console.log(data.toString().trim());
      });

      syncProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error(data.toString().trim());
      });

      syncProcess.on('close', (code) => {
        if (code === 0) {
          res.status(200).json({
            success: true,
            message: 'Data sync completed successfully!',
            output: output.trim()
          });
        } else {
          res.status(500).json({
            success: false,
            error: errorOutput || 'Sync process failed',
            message: 'Error occurred during sync'
          });
        }
      });

      syncProcess.on('error', (err) => {
        console.error('Failed to start sync process:', err);
        res.status(500).json({
          success: false,
          error: err.message,
          message: 'Failed to start sync process'
        });
      });
    } catch (err) {
      console.error('Error syncing with DynamoDB:', err);
      res.status(200).json({
        success: false,
        offline: true,
        error: err.message,
        message: 'Error occurred, but your progress is saved locally and will sync when online.'
      });
    }
  }

  async getConnectionStatus(req, res) {
    res.json({
      online: true,
      dynamoConnected: dynamoVideoService.isDynamoAvailable()
    });
  }

  async ping(req, res) {
    if (dynamoVideoService.isDynamoAvailable()) {
      res.status(200).end();
    } else {
      res.status(503).end();
    }
  }
}

module.exports = new SyncController();