
// Enhanced Video Service with Connection Handling
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { withRetry, logger } = require('./errorHandling');

class VideoService {
    constructor() {
        this.localStoragePath = path.join(__dirname, '..', 'data', 'localStorage.json');
        this.ensureDataDirectory();
    }

    ensureDataDirectory() {
        const dataDir = path.dirname(this.localStoragePath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    }

    // Safe database operation wrapper
    async safeDbOperation(operation, fallback = null) {
        try {
            if (!mongoose.connection.readyState) {
                logger.warn('Database not connected, using fallback');
                return fallback ? await fallback() : null;
            }
            
            return await withRetry(operation);
        } catch (error) {
            logger.error('Database operation failed', {
                error: error.message,
                stack: error.stack
            });
            
            // Use fallback if available
            if (fallback) {
                logger.info('Using fallback operation');
                return await fallback();
            }
            
            throw error;
        }
    }

    // Get videos with connection handling
    async getVideosForCourse(courseName) {
        const dbOperation = async () => {
            const collection = mongoose.connection.collection(courseName);
            return await collection.find({}).toArray();
        };
        
        const fallbackOperation = () => {
            const localStorage = this.getLocalStorage();
            return localStorage[courseName] || [];
        };
        
        try {
            return await this.safeDbOperation(dbOperation, fallbackOperation);
        } catch (error) {
            logger.error(`Error getting videos for course ${courseName}`, error);
            return fallbackOperation();
        }
    }

    // Get video by ID with connection handling
    async getVideoById(courseName, videoId) {
        const dbOperation = async () => {
            const collection = mongoose.connection.collection(courseName);
            return await collection.findOne({ _id: new mongoose.Types.ObjectId(videoId) });
        };
        
        const fallbackOperation = () => {
            const localStorage = this.getLocalStorage();
            const videos = localStorage[courseName] || [];
            return videos.find(v => v._id && v._id.toString() === videoId);
        };
        
        try {
            return await this.safeDbOperation(dbOperation, fallbackOperation);
        } catch (error) {
            logger.error(`Error getting video ${videoId} for course ${courseName}`, error);
            return fallbackOperation();
        }
    }

    // Mark video as watched with connection handling
    async markVideoAsWatched(courseName, videoId) {
        const watchedAt = new Date();
        
        // Always update localStorage first
        const localStorage = this.getLocalStorage();
        if (!localStorage[courseName]) {
            localStorage[courseName] = [];
        }
        
        const videoIndex = localStorage[courseName].findIndex(v => 
            v && v._id && v._id.toString() === videoId
        );
        
        if (videoIndex >= 0) {
            localStorage[courseName][videoIndex].watched = true;
            localStorage[courseName][videoIndex].watchedAt = watchedAt;
        }
        
        this.saveLocalStorage(localStorage);
        
        // Try to update database if connected
        const dbOperation = async () => {
            const collection = mongoose.connection.collection(courseName);
            return await collection.updateOne(
                { _id: new mongoose.Types.ObjectId(videoId) },
                { $set: { watched: true, watchedAt: watchedAt } }
            );
        };
        
        try {
            await this.safeDbOperation(dbOperation);
            logger.info(`Successfully marked video ${videoId} as watched in both localStorage and database`);
        } catch (error) {
            logger.warn(`Failed to update database, but localStorage updated for video ${videoId}`, error);
        }
        
        return true;
    }

    // Local storage operations
    getLocalStorage() {
        try {
            if (fs.existsSync(this.localStoragePath)) {
                const data = fs.readFileSync(this.localStoragePath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            logger.error('Error reading localStorage', error);
        }
        return {};
    }

    saveLocalStorage(data) {
        try {
            fs.writeFileSync(this.localStoragePath, JSON.stringify(data, null, 2));
            logger.debug('LocalStorage saved successfully');
        } catch (error) {
            logger.error('Error saving localStorage', error);
            throw error;
        }
    }

    // Sync with MongoDB when connection is available
    async syncWithMongoDB() {
        if (!mongoose.connection.readyState) {
            logger.warn('Cannot sync: MongoDB not connected');
            return false;
        }
        
        try {
            const localStorage = this.getLocalStorage();
            
            for (const [courseName, videos] of Object.entries(localStorage)) {
                if (!Array.isArray(videos)) continue;
                
                const collection = mongoose.connection.collection(courseName);
                
                for (const video of videos) {
                    if (!video._id) continue;
                    
                    await withRetry(async () => {
                        await collection.updateOne(
                            { _id: new mongoose.Types.ObjectId(video._id) },
                            { $set: { watched: video.watched, watchedAt: video.watchedAt } },
                            { upsert: false }
                        );
                    });
                }
            }
            
            logger.info('Successfully synced localStorage with MongoDB');
            return true;
            
        } catch (error) {
            logger.error('Error syncing with MongoDB', error);
            return false;
        }
    }
}

module.exports = new VideoService();
