const { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand } = require('@aws-sdk/client-transcribe');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

class TranscribeService {
  constructor() {
    this.transcribeClient = new TranscribeClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    
    this.bucket = process.env.S3_BUCKET_NAME;
  }

  async uploadAudioToS3(audioPath, key) {
    const fileStream = fs.createReadStream(audioPath);
    const params = {
      Bucket: this.bucket,
      Key: key,
      Body: fileStream,
      ContentType: 'audio/wav'
    };
    
    await this.s3Client.send(new PutObjectCommand(params));
    return `s3://${this.bucket}/${key}`;
  }

  async startTranscription(audioPath, jobName, format = 'wav') {
    try {
      // Validate inputs
      if (!this.bucket) {
        throw new Error('S3_BUCKET_NAME environment variable not set');
      }
      
      // Upload audio to S3 first
      console.log(`Uploading audio to S3: ${audioPath}`);
      const s3Key = `transcribe-input/${jobName}.${format}`;
      const mediaUri = await this.uploadAudioToS3(audioPath, s3Key);
      console.log(`Audio uploaded to: ${mediaUri}`);
      
      const params = {
        TranscriptionJobName: jobName,
        LanguageCode: 'en-US',
        MediaFormat: format,
        Media: {
          MediaFileUri: mediaUri
        },
        OutputBucketName: this.bucket,
        OutputKey: `transcribe-output/${jobName}.json`,
        Subtitles: {
          Formats: ['srt']
        }
      };

      console.log('Starting transcription with params:', JSON.stringify(params, null, 2));
      const result = await this.transcribeClient.send(new StartTranscriptionJobCommand(params));
      console.log(`Started transcription job: ${jobName}`, result);
      return jobName;
    } catch (error) {
      console.error('Failed to start transcription job:', error);
      throw error;
    }
  }

  async checkTranscriptionStatus(jobName) {
    try {
      const params = {
        TranscriptionJobName: jobName
      };
      
      const result = await this.transcribeClient.send(new GetTranscriptionJobCommand(params));
      return result.TranscriptionJob;
    } catch (error) {
      if (error.name === 'BadRequestException' && error.message.includes("couldn't be found")) {
        console.error(`Transcription job not found: ${jobName}`);
        throw new Error(`Transcription job ${jobName} was not created successfully`);
      }
      throw error;
    }
  }

  async downloadSrtFromS3(jobName, outputPath) {
    const params = {
      Bucket: this.bucket,
      Key: `transcribe-output/${jobName}.srt`
    };
    
    const result = await this.s3Client.send(new GetObjectCommand(params));
    const srtContent = await result.Body.transformToString();
    
    fs.writeFileSync(outputPath, srtContent);
    return outputPath;
  }

  async processLargeVideo(videoPath, videoTitle) {
    const jobName = `transcribe-${Date.now()}-${videoTitle.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50)}`;
    const tempAudioPath = path.join(path.dirname(videoPath), `${path.basename(videoPath, path.extname(videoPath))}_transcribe_temp.wav`);
    
    try {
      console.log(`Starting AWS Transcribe job: ${jobName}`);
      
      // Extract audio first for faster upload and processing
      console.log('Extracting audio for AWS Transcribe...');
      const videoCompression = require('./videoCompression');
      await videoCompression.extractAudio(videoPath, tempAudioPath, { 
        format: 'wav', 
        audioBitrate: '32k',
        audioChannels: 1,
        audioSampleRate: 16000
      });
      
      // Start transcription with audio file
      await this.startTranscription(tempAudioPath, jobName, 'wav');
      
      // Poll for completion with progress updates
      let job;
      let pollCount = 0;
      do {
        await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
        job = await this.checkTranscriptionStatus(jobName);
        pollCount++;
        
        console.log(`AWS Transcribe status (${pollCount * 0.5}min): ${job.TranscriptionJobStatus}`);
        
        // Update global progress if available
        if (global.srtGenerationProgress) {
          const progress = job.TranscriptionJobStatus === 'IN_PROGRESS' ? Math.min(90, pollCount * 5) : 100;
          global.srtGenerationProgress.set(videoTitle, { 
            status: job.TranscriptionJobStatus.toLowerCase(), 
            progress,
            service: 'AWS Transcribe'
          });
        }
        
        // Timeout after 30 minutes
        if (pollCount > 60) {
          throw new Error('AWS Transcribe timeout after 30 minutes');
        }
        
      } while (job.TranscriptionJobStatus === 'IN_PROGRESS');
      
      if (job.TranscriptionJobStatus === 'COMPLETED') {
        // Download SRT file
        const srtPath = path.join(path.dirname(videoPath), `${path.basename(videoPath, path.extname(videoPath))}.srt`);
        await this.downloadSrtFromS3(jobName, srtPath);
        console.log(`AWS Transcribe completed! SRT file saved: ${srtPath}`);
        
        if (global.srtGenerationProgress) {
          global.srtGenerationProgress.set(videoTitle, { 
            status: 'completed', 
            progress: 100,
            service: 'AWS Transcribe'
          });
        }
        
        return srtPath;
      } else {
        throw new Error(`AWS Transcribe failed: ${job.FailureReason}`);
      }
    } catch (error) {
      console.error('AWS Transcribe error:', error);
      
      if (global.srtGenerationProgress) {
        global.srtGenerationProgress.set(videoTitle, { 
          status: 'failed', 
          progress: 0,
          service: 'AWS Transcribe',
          error: error.message
        });
      }
      
      throw error;
    } finally {
      // Clean up temporary audio file
      if (fs.existsSync(tempAudioPath)) {
        try {
          fs.unlinkSync(tempAudioPath);
          console.log('Cleaned up temporary audio file');
        } catch (cleanupError) {
          console.warn('Failed to clean up temporary audio file:', cleanupError.message);
        }
      }
    }
  }
}

module.exports = new TranscribeService();