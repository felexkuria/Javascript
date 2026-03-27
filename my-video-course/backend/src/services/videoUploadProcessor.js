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
   * 🛰️ Google-Grade Event-Driven Entry Point
   * Submits the job and returns immediately.
   */
  async processUploadedVideo(bucketName, videoKey, videoTitle, courseName) {
    logger.info(`📡 Ingestion Triggered: ${videoTitle}`, { bucketName, videoKey, courseName });
    
    try {
      const videoUrl = `s3://${bucketName}/${videoKey}`;
      
      // 1. Submit Job (Non-blocking)
      const { jobName } = await this.submitTranscriptionJob(videoUrl, videoTitle);
      
      // 2. Simulate Event-Driven Trigger (Temporary for monolithic dev)
      this.simulateEventTrigger(jobName, videoTitle, courseName);
      
      return { success: true, jobName };
    } catch (error) {
      logger.error(`❌ Ingestion Trigger Failed: ${videoTitle}`, error, { courseName });
      return { success: false, error: error.message };
    }
  }

  /**
   * 🔄 Event Simulator (Removes Polling from Main Loop)
   */
  async simulateEventTrigger(jobName, videoTitle, courseName, attempt = 0) {
    if (attempt > 30) {
      logger.warn(`🏮 DLQ Triggered: Job ${jobName} timed out after 30 attempts`, { videoTitle, courseName });
      await dynamoService.moveToDLQ({ jobName, videoTitle, courseName }, 'Timeout: Transcription took > 5 mins');
      return;
    }

    setTimeout(async () => {
      try {
        const result = await this.handleJobCompletion(jobName, videoTitle, courseName);
        if (!result.success && result.status === 'IN_PROGRESS') {
          this.simulateEventTrigger(jobName, videoTitle, courseName, attempt + 1);
        }
      } catch (err) {
        logger.error('Event Simulator Error', err, { jobName, videoTitle });
      }
    }, 10000);
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
    console.log(`📡 Event-Driven Ingestion: Submitted job ${jobName}`);
    return { success: true, jobName };
  }

  // 🛰️ Completion Handler (Step 2 - Triggered by Event/SQS)
  async handleJobCompletion(jobName, videoTitle, courseName) {
    console.log(`🛰️ Event-Driven Processing: Telemetry received for ${jobName}`);
    
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

      console.log(`✅ Event-Driven Completion Success: ${videoTitle}`);
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
        console.log(`✅ Updated video record in DynamoDB: ${videoTitle}`);
      }
    } catch (error) {
      console.warn('Failed to update video record in DynamoDB:', error);
    }
  }
}

module.exports = new VideoUploadProcessor();