/**
 * 🛰️ Google-Grade Event-Driven Processor
 * Triggered by AWS EventBridge when a Transcribe Job reaches 'COMPLETED' or 'FAILED'.
 */
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const srtQuizGenerator = require('../services/srtQuizGenerator');
const labGeneratorService = require('../services/labGeneratorService');
const dynamoVideoService = require('../services/dynamoVideoService');
const logger = require('../utils/logger');
const https = require('https');

const transcribe = new TranscribeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const cw = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

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
    
    // 🔍 SOTA Metadata Extraction: Format: "Title-Timestamp"
    const jobNameParts = jobName.split('-');
    const videoTitle = jobNameParts.slice(1, -1).join('-').replace(/[^a-zA-Z0-9 ]/g, ' '); 
    const courseName = "Course"; // Fallback, real implementation would fetch from GSI

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

    // 4. 🧠 Parallel Orchestration: Quiz + Summary + Lab
    const srtEntries = srtQuizGenerator.parseSRT({ content: srtContent });
    
    // Find video for correct ID linking
    const videos = await dynamoVideoService.getVideosForCourse(courseName);
    const video = videos.find(v => v.title.toLowerCase().includes(videoTitle.toLowerCase()));
    const videoId = video ? (video._id || video.videoId) : 'master';

    const stats = { retried: false };
    const [quiz, summary, lab] = await Promise.all([
      srtQuizGenerator.generateAIQuestions(srtEntries, videoTitle, 600, { stats }),
      srtQuizGenerator.generateSummaryAndTopics(srtEntries, videoTitle),
      labGeneratorService.generateLabFromSRT(srtEntries, videoTitle, courseName, videoId)
    ]);

    // 5. Update DynamoDB (Final Commit)
    if (video) {
        const processedAt = new Date();
        const createdAt = video.createdAt ? new Date(video.createdAt) : processedAt;
        const latencyMs = processedAt - createdAt;

        await dynamoVideoService.updateVideo(courseName, video._id, {
            captionsReady: true,
            quizReady: true,
            summaryReady: true,
            labReady: true,
            processing: false,
            processedAt: processedAt.toISOString()
        });

        // 📊 Pillar 6: CloudWatch Telemetry
        await cw.send(new PutMetricDataCommand({
            Namespace: 'VideoPipeline/Ingestion',
            MetricData: [
                { MetricName: 'ExtractionSuccess', Value: 1, Unit: 'Count' },
                { MetricName: 'ExtractionRetryCount', Value: stats.retried ? 1 : 0, Unit: 'Count' },
                { MetricName: 'TotalProcessingLatency', Value: latencyMs / 1000, Unit: 'Seconds' }
            ]
        }));

        logger.info(`✅ Video processed and DB updated: ${videoTitle}`, { videoTitle, jobName, latencySeconds: latencyMs / 1000 });
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
