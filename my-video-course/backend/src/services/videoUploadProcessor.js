const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand } = require('@aws-sdk/client-transcribe');
const srtQuizGenerator = require('./srtQuizGenerator');
const { withRetry } = require('../utils/retry');
const logger = require('../utils/logger');
const dynamoService = require('../utils/dynamodb');

class VideoUploadProcessor {
  constructor() {
    this.s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    this.transcribe = new TranscribeClient({ region: process.env.AWS_REGION || 'us-east-1' });
  }

  /**
   * 🏗️ Event-Driven Ingestion Path
   * Submits the job and returns immediately. 
   * Post-processing is handled by AWS Lambda + EventBridge.
   */
  async processUploadedVideo(bucketName, videoKey, videoTitle, courseName) {
    logger.info(`📡 Ingestion Started (Event-Driven): ${videoTitle}`, { videoKey, courseName });
    
    try {
      const videoUrl = `s3://${bucketName}/${videoKey}`;
      
      // Submit Job to AWS Transcribe
      const { jobName } = await this.submitTranscriptionJob(videoUrl, videoTitle);
      
      // Note: No polling here. The 'onTranscribeComplete' Lambda will 
      // automatically trigger when AWS finishes the job.
      
      return { success: true, jobName };
    } catch (error) {
      logger.error(`❌ Ingestion Trigger Failed: ${videoTitle}`, error, { courseName });
      return { success: false, error: error.message };
    }
  }

  // Phase 3: Decoupled Ingestion
  // 🛰️ Submit job to AWS (Step 1)
  async submitTranscriptionJob(videoUrl, videoTitle) {
    const jobName = `transcribe-${videoTitle.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`;
    
    const command = new StartTranscriptionJobCommand({
      TranscriptionJobName: jobName,
      Media: { MediaFileUri: videoUrl },
      MediaFormat: 'mp4',
      LanguageCode: 'en-US',
      Subtitles: { Formats: ['srt'] }
    });

    await this.transcribe.send(command);
    logger.info(`📡 Transcription Job Submitted: ${jobName}`, { jobName, videoUrl });
    return { success: true, jobName };
  }

  // 🛰️ Completion Handler (Step 2 - Triggered by Event/SQS)
  async handleJobCompletion(jobName, videoTitle, courseName) {
    logger.info(`🛰️ Processing Telemetry Received: ${jobName}`, { jobName, videoTitle, courseName });
    
    const command = new GetTranscriptionJobCommand({ TranscriptionJobName: jobName });
    const response = await this.transcribe.send(command);
    const job = response.TranscriptionJob;

    if (job.TranscriptionJobStatus === 'COMPLETED') {
      const srtUri = job.Subtitles.SubtitleFileUris[0];
      const srtContent = await this.downloadFile(srtUri);
      
      // Store captions with Google-Grade prefixing
      const s3Key = `processed-content/captions/${Date.now()}-${videoTitle}.srt`;
      await this.s3.putObject({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: s3Key,
        Body: srtContent,
        ContentType: 'text/plain'
      });

      // AI Content Generation (Stage 4)
      const srtEntries = srtQuizGenerator.parseSRT({ content: srtContent });
      const [quiz, summary] = await Promise.all([
        withRetry(() => srtQuizGenerator.generateAIQuestions(srtEntries, videoTitle, '0:00')),
        withRetry(() => srtQuizGenerator.generateSummaryAndTopics(srtEntries, videoTitle))
      ]);

      await this.updateVideoRecord(videoTitle, courseName, {
        captionsReady: true,
        quizReady: true,
        summaryReady: true,
        processing: false,
        processedAt: new Date()
      });

      logger.info(`✅ Processing Success: ${videoTitle}`, { jobName, videoTitle, courseName });
      return { success: true };
    }
    return { success: false, status: job.TranscriptionJobStatus };
  }

  // Get video metadata
  async getVideoMetadata(bucketName, videoKey) {
    try {
      const headObject = await this.s3.headObject({
        Bucket: bucketName,
        Key: videoKey
      }).promise();
      
      return {
        size: headObject.ContentLength,
        lastModified: headObject.LastModified,
        duration: headObject.Metadata?.duration || 0
      };
    } catch (error) {
      return { size: 0, duration: 0 };
    }
  }

  // Download file from URL
  async downloadFile(url) {
    const https = require('https');
    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  // Update video record in DynamoDB
  async updateVideoRecord(videoTitle, courseName, updates) {
    try {
      const dynamoVideoService = require('./dynamoVideoService');
      const videos = await dynamoVideoService.getVideosForCourse(courseName);
      const video = videos.find(v => v.title === videoTitle);
      
      if (video) {
        await dynamoVideoService.updateVideo(courseName, video._id, updates);
        logger.info(`✅ Record Updated: ${videoTitle}`, { videoTitle, courseName, updates });
      }
    } catch (error) {
      logger.warn('Failed to update video record in DynamoDB', { error: error.message, videoTitle, courseName });
    }
  }
}

module.exports = new VideoUploadProcessor();