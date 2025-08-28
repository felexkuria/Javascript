const { S3Client } = require('@aws-sdk/client-s3');
const srtQuizGenerator = require('./srtQuizGenerator');

class VideoUploadProcessor {
  constructor() {
    this.s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    // Transcribe service would need to be imported separately
  }

  // Process video immediately after upload
  async processUploadedVideo(bucketName, videoKey, videoTitle, courseName) {
    console.log(`Processing uploaded video: ${videoTitle}`);
    
    try {
      // Start all processing in parallel
      const videoUrl = `s3://${bucketName}/${videoKey}`;
      
      // 1. Start transcription job
      const transcriptionPromise = this.startTranscription(videoUrl, videoTitle);
      
      // 2. Get video metadata
      const metadata = await this.getVideoMetadata(bucketName, videoKey);
      
      // 3. Wait for transcription and generate AI content
      const transcriptionResult = await transcriptionPromise;
      
      if (transcriptionResult.success) {
        // Generate quiz and summary in parallel
        const srtEntries = srtQuizGenerator.parseSRT({ content: transcriptionResult.srtContent });
        
        const [quiz, summary] = await Promise.all([
          srtQuizGenerator.generateAIQuestions(srtEntries, videoTitle, metadata.duration),
          srtQuizGenerator.generateSummaryAndTopics(srtEntries, videoTitle)
        ]);
        
        // Update video record with processing status
        await this.updateVideoRecord(videoTitle, courseName, {
          captionsReady: true,
          quizReady: true,
          summaryReady: true,
          duration: metadata.duration,
          processedAt: new Date()
        });
        
        console.log(`✅ Video processing complete: ${videoTitle}`);
        return { success: true, quiz, summary };
      }
      
      throw new Error('Transcription failed');
    } catch (error) {
      console.error(`❌ Video processing failed: ${videoTitle}`, error);
      await this.updateVideoRecord(videoTitle, courseName, {
        processingError: error.message,
        processedAt: new Date()
      });
      return { success: false, error: error.message };
    }
  }

  // Start AWS Transcribe job
  async startTranscription(videoUrl, videoTitle) {
    const jobName = `upload-${videoTitle.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`;
    
    await this.transcribe.startTranscriptionJob({
      TranscriptionJobName: jobName,
      Media: { MediaFileUri: videoUrl },
      MediaFormat: 'mp4',
      LanguageCode: 'en-US',
      Subtitles: { Formats: ['srt', 'vtt'] }
    }).promise();
    
    // Poll for completion
    let job;
    do {
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10s intervals
      job = await this.transcribe.getTranscriptionJob({ TranscriptionJobName: jobName }).promise();
    } while (job.TranscriptionJob.TranscriptionJobStatus === 'IN_PROGRESS');
    
    if (job.TranscriptionJob.TranscriptionJobStatus === 'COMPLETED') {
      const subtitleUris = job.TranscriptionJob.Subtitles.SubtitleFileUris;
      const srtUri = subtitleUris.find(uri => uri.includes('.srt'));
      const vttUri = subtitleUris.find(uri => uri.includes('.vtt'));
      
      // Download and store captions
      const [srtContent, vttContent] = await Promise.all([
        srtUri ? this.downloadFile(srtUri) : null,
        vttUri ? this.downloadFile(vttUri) : null
      ]);
      
      // Store in S3
      if (srtContent) {
        await this.s3.putObject({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: `captions/${videoTitle}.srt`,
          Body: srtContent,
          ContentType: 'text/plain'
        }).promise();
      }
      
      if (vttContent) {
        await this.s3.putObject({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: `captions/${videoTitle}.vtt`,
          Body: vttContent,
          ContentType: 'text/vtt'
        }).promise();
      }
      
      // Store in MongoDB
      await srtQuizGenerator.storeSRT(videoTitle, srtContent);
      
      return { success: true, srtContent, vttContent };
    }
    
    return { success: false };
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

  // Update video record in MongoDB
  async updateVideoRecord(videoTitle, courseName, updates) {
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState) {
        const collection = mongoose.connection.collection('videos');
        await collection.updateOne(
          { title: videoTitle, courseName },
          { $set: updates },
          { upsert: false }
        );
      }
    } catch (error) {
      console.warn('Failed to update video record:', error);
    }
  }
}

module.exports = new VideoUploadProcessor();