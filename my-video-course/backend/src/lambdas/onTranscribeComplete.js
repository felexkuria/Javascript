/**
 * 🛰️ Google-Grade Event-Driven Processor
 * Triggered by AWS EventBridge when a Transcribe Job reaches 'COMPLETED' or 'FAILED'.
 */
const { TranscribeClient, GetTranscriptionJobCommand } = require('@aws-sdk/client-transcribe');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const srtQuizGenerator = require('../services/srtQuizGenerator');
const dynamoVideoService = require('../services/dynamoVideoService');
const logger = require('../utils/logger');
const https = require('https');

const transcribe = new TranscribeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

exports.handler = async (event) => {
  const jobName = event.detail.TranscriptionJobName;
  const status = event.detail.TranscriptionJobStatus;

  logger.info(`🛰️ EventBridge Triggered: Job ${jobName} is ${status}`, { jobName, status });

  if (status !== 'COMPLETED') {
    logger.warn(`🏮 Job ${jobName} failed or was cancelled.`, { jobName, status });
    return { statusCode: 200, body: 'Job not completed' };
  }

  try {
    // 1. Get Job Details
    const jobRes = await transcribe.send(new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }));
    const job = jobRes.TranscriptionJob;
    const srtUri = job.Subtitles.SubtitleFileUris[0];
    
    // Extract metadata from Job Name (formatted by start_transcribe)
    // Format: "Title-Timestamp"
    const jobNameParts = jobName.split('-');
    const videoTitle = jobNameParts.slice(1, -1).join('-').replace(/[^a-zA-Z0-9 ]/g, ' '); 
    const courseName = "Course"; // In a real scenario, this would be in the metadata or job name

    // 2. Download Caption File
    const srtContent = await downloadFile(srtUri);
    
    // 3. Store Captions in S3
    const s3Key = `processed-content/captions/${Date.now()}-${jobName}.srt`;
    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: srtContent,
      ContentType: 'text/plain'
    }));

    // 4. Generate AI Content
    const srtEntries = srtQuizGenerator.parseSRT({ content: srtContent });
    const [quiz, summary] = await Promise.all([
      srtQuizGenerator.generateAIQuestions(srtEntries, videoTitle, '0:00'),
      srtQuizGenerator.generateSummaryAndTopics(srtEntries, videoTitle)
    ]);

    // 5. Update DynamoDB (Final Commit)
    const videos = await dynamoVideoService.getVideosForCourse(courseName);
    const video = videos.find(v => v.title.toLowerCase().includes(videoTitle.toLowerCase()));
    
    if (video) {
        await dynamoVideoService.updateVideo(courseName, video._id, {
            captionsReady: true,
            quizReady: true,
            summaryReady: true,
            processing: false,
            processedAt: new Date().toISOString()
        });
        logger.info(`✅ Video processed and DB updated: ${videoTitle}`, { videoTitle, jobName });
    }

    return { statusCode: 200, body: 'Success' };
  } catch (error) {
    logger.error(`❌ Lambda Processing Error: ${jobName}`, error);
    throw error;
  }
};

async function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}
