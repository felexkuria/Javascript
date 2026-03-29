const aiService = require('./aiService');
const dynamoVideoService = require('./dynamoVideoService');
const logger = require('../utils/logger');

class LabGeneratorService {
  async generateLabFromSRT(srtEntries, videoTitle, courseName, videoId) {
    if (!srtEntries || srtEntries.length === 0) return null;

    try {
      // 1. Check Cache First
      const cached = await dynamoVideoService.getCachedLearningContent(courseName, videoId, 'lab');
      if (cached) {
        logger.info(`🔍 Using cached Lab for: ${videoTitle}`);
        return JSON.parse(cached);
      }

      // 2. Prepare context
      const transcript = srtEntries.map(e => e.text).join(' ').slice(0, 5000);
      
      logger.info(`🧪 Generating AI Lab for: ${videoTitle}`);
      const lab = await aiService.generateLab(transcript, videoTitle);
      
      // 3. Persist for future sessions
      await dynamoVideoService.cacheLearningContent(courseName, videoId, 'lab', lab);
      
      return lab;
    } catch (error) {
      logger.error(`❌ Lab Generation Failed for ${videoTitle}:`, error);
      return null;
    }
  }

  async getStoredLab(courseName, videoId) {
    const raw = await dynamoVideoService.getCachedLearningContent(courseName, videoId, 'lab');
    return raw ? JSON.parse(raw) : null;
  }
}

module.exports = new LabGeneratorService();
