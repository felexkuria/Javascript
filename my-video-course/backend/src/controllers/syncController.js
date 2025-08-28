const videoService = require('../services/videoService');
const gamificationManager = require('../services/gamificationManager');
const dynamoService = require('../services/dynamoService');
const mongoose = require('mongoose');
const { spawn } = require('child_process');
const path = require('path');

class SyncController {
  async syncAllStorages(req, res) {
    try {
      console.log('Starting comprehensive data sync across all storage systems...');
      
      const results = {
        localStorage: { status: 'success', courses: 0, videos: 0 },
        mongodb: { status: 'unavailable', courses: 0, videos: 0, synced: 0 },
        dynamodb: { status: 'unavailable', courses: 0, videos: 0, synced: 0 },
        errors: []
      };

      // Get data from localStorage
      const localStorage = videoService.getLocalStorage();
      const courseNames = Object.keys(localStorage);
      results.localStorage.courses = courseNames.length;
      results.localStorage.videos = Object.values(localStorage).reduce((sum, videos) => sum + videos.length, 0);

      // Sync with MongoDB
      try {
        if (mongoose.connection.readyState) {
          results.mongodb.status = 'success';
          
          for (const courseName of courseNames) {
            const localVideos = localStorage[courseName] || [];
            if (localVideos.length === 0) continue;
            
            const courseCollection = mongoose.connection.collection(courseName);
            const dbVideos = await courseCollection.find({}).toArray();
            
            for (const localVideo of localVideos) {
              if (!localVideo?._id) continue;
              
              const dbVideo = dbVideos.find(v => v._id.toString() === localVideo._id.toString());
              if (dbVideo) {
                if (dbVideo.watched !== localVideo.watched || dbVideo.watchedAt !== localVideo.watchedAt) {
                  await courseCollection.updateOne(
                    { _id: dbVideo._id },
                    { $set: { watched: localVideo.watched, watchedAt: localVideo.watchedAt } }
                  );
                  results.mongodb.synced++;
                }
              } else {
                await courseCollection.insertOne(localVideo);
                results.mongodb.synced++;
              }
            }
            
            results.mongodb.courses++;
            results.mongodb.videos += localVideos.length;
          }
        }
      } catch (mongoError) {
        results.mongodb.status = 'error';
        results.errors.push(`MongoDB: ${mongoError.message}`);
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

      if (!mongoose.connection.readyState) {
        return res.status(503).json({ error: 'Could not connect to MongoDB', success: false });
      }

      const localStorage = videoService.getLocalStorage();
      if (!localStorage[courseName]) {
        return res.status(404).json({ error: `Course ${courseName} not found in localStorage`, success: false });
      }

      const localVideos = localStorage[courseName];
      const courseCollection = mongoose.connection.collection(courseName);
      const dbVideos = await courseCollection.find({}).toArray();

      let syncedCount = 0;
      let addedCount = 0;
      let updatedCount = 0;

      for (const localVideo of localVideos) {
        if (!localVideo || !localVideo._id) continue;

        const dbVideo = dbVideos.find(v => v._id.toString() === localVideo._id.toString());

        if (dbVideo) {
          const updateData = {
            watched: localVideo.watched || false,
            watchedAt: localVideo.watchedAt || null
          };

          if (dbVideo.watched !== localVideo.watched ||
            dbVideo.watchedAt !== localVideo.watchedAt) {
            await courseCollection.updateOne(
              { _id: dbVideo._id },
              { $set: updateData }
            );
            updatedCount++;
          }
          syncedCount++;
        } else {
          try {
            await courseCollection.insertOne(localVideo);
            addedCount++;
          } catch (insertErr) {
            console.warn(`Failed to insert video ${localVideo.title}:`, insertErr.message);
          }
        }
      }

      // Update localStorage with any MongoDB videos not in localStorage
      for (const dbVideo of dbVideos) {
        const localVideo = localVideos.find(v => v._id && v._id.toString() === dbVideo._id.toString());
        if (!localVideo) {
          localStorage[courseName].push(dbVideo);
        }
      }

      videoService.saveLocalStorage(localStorage);

      const message = `Sync completed: ${syncedCount} matched, ${updatedCount} updated, ${addedCount} added to MongoDB`;

      res.status(200).json({
        success: true,
        message,
        syncedCount,
        updatedCount,
        addedCount,
        totalLocal: localVideos.length,
        totalMongoDB: dbVideos.length
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
      console.error('Error syncing with MongoDB:', err);
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
      online: mongoose.connection.readyState === 1,
      mongoConnected: mongoose.connection.readyState === 1
    });
  }

  async ping(req, res) {
    if (mongoose.connection.readyState) {
      res.status(200).end();
    } else {
      res.status(503).end();
    }
  }
}

module.exports = new SyncController();