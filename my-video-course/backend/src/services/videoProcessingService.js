const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const dynamodb = require('../utils/dynamodb');
const aiService = require('./aiService');

class VideoProcessingService {
  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: process.env.AWS_ACCESS_KEY_ID ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      } : undefined
    });
    this.bucketName = process.env.S3_BUCKET_NAME;
    this.isLocal = !process.env.AWS_EXECUTION_ENV;
  }

  async processVideo(videoFile, courseName, title) {
    const tempDir = path.join(os.tmpdir(), `video-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // Save original video
      const originalPath = path.join(tempDir, 'original.mp4');
      fs.writeFileSync(originalPath, videoFile.buffer);

      // Compress video
      const compressedPath = await this.compressVideo(originalPath, tempDir);
      
      // Upload to S3
      const s3Key = `videos/${courseName}/${Date.now()}-${title.replace(/[^a-zA-Z0-9]/g, '-')}.mp4`;
      const videoUrl = await this.uploadToS3(compressedPath, s3Key);

      // Generate captions
      const captionsUrl = await this.generateCaptions(videoUrl, s3Key, tempDir);

      // Generate AI content
      const aiContent = await this.generateAIContent(captionsUrl, courseName, title);

      // Save to DynamoDB
      const videoData = {
        _id: Date.now().toString(),
        courseName,
        title,
        videoUrl,
        s3Key,
        captionsUrl,
        ...aiContent,
        createdAt: new Date().toISOString()
      };

      await dynamodb.saveVideo(videoData);

      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true });

      return videoData;
    } catch (error) {
      // Cleanup on error
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      throw error;
    }
  }

  async compressVideo(inputPath, tempDir) {
    const outputPath = path.join(tempDir, 'compressed.mp4');
    
    // Check if ffmpeg is available
    try {
      await new Promise((resolve, reject) => {
        const testFFmpeg = spawn('ffmpeg', ['-version']);
        testFFmpeg.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error('FFmpeg not available'));
        });
        testFFmpeg.on('error', () => reject(new Error('FFmpeg not found')));
      });
    } catch (error) {
      console.warn('FFmpeg not available, skipping compression');
      // Copy original file if ffmpeg not available
      fs.copyFileSync(inputPath, outputPath);
      return outputPath;
    }
    
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-crf', '28',
        '-preset', 'fast',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ]);

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          // Fallback to original if compression fails
          console.warn('FFmpeg compression failed, using original file');
          fs.copyFileSync(inputPath, outputPath);
          resolve(outputPath);
        }
      });

      ffmpeg.on('error', (error) => {
        console.warn('FFmpeg error, using original file:', error.message);
        fs.copyFileSync(inputPath, outputPath);
        resolve(outputPath);
      });
    });
  }

  async uploadToS3(filePath, s3Key) {
    if (!this.bucketName) {
      throw new Error('S3_BUCKET_NAME not configured');
    }
    
    const fileBuffer = fs.readFileSync(filePath);
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: 'video/mp4'
    });

    await this.s3Client.send(command);
    return `https://${this.bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
  }

  async generateCaptions(videoUrl, s3Key, tempDir) {
    if (this.isLocal) {
      return this.generateCaptionsLocal(videoUrl, s3Key, tempDir);
    } else {
      return this.generateCaptionsEC2(videoUrl, s3Key);
    }
  }

  async generateCaptionsLocal(videoUrl, s3Key, tempDir) {
    const srtPath = path.join(tempDir, 'captions.srt');

    // Generate SRT (placeholder - integrate with speech-to-text service)
    const srtContent = this.generatePlaceholderSRT();
    fs.writeFileSync(srtPath, srtContent);

    // Upload SRT to S3
    const srtKey = s3Key.replace('.mp4', '.srt');
    const srtBuffer = fs.readFileSync(srtPath);
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: srtKey,
      Body: srtBuffer,
      ContentType: 'text/plain'
    });

    await this.s3Client.send(command);
    return `https://${this.bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${srtKey}`;
  }

  async generateCaptionsEC2(videoUrl, s3Key) {
    // Trigger EC2 processing via Lambda or direct API call
    // For now, return placeholder
    const srtKey = s3Key.replace('.mp4', '.srt');
    const srtContent = this.generatePlaceholderSRT();
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: srtKey,
      Body: srtContent,
      ContentType: 'text/plain'
    });

    await this.s3Client.send(command);
    return `https://${this.bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${srtKey}`;
  }

  generatePlaceholderSRT() {
    return `1
00:00:00,000 --> 00:00:05,000
Welcome to this video lesson

2
00:00:05,000 --> 00:00:10,000
In this tutorial, we will cover the main concepts

3
00:00:10,000 --> 00:00:15,000
Please follow along and take notes
`;
  }

  async generateAIContent(captionsUrl, courseName, title) {
    try {
      // Get captions content
      const captionsContent = await this.getCaptionsContent(captionsUrl);
      
      // Generate AI content
      const [quiz, summary, todoList] = await Promise.all([
        aiService.generateQuiz(captionsContent, title),
        aiService.generateSummary(captionsContent, title),
        aiService.generateTodoList(captionsContent, title)
      ]);

      return { quiz, summary, todoList };
    } catch (error) {
      console.error('AI content generation failed:', error);
      return {
        quiz: { questions: [] },
        summary: 'Summary will be generated shortly.',
        todoList: { tasks: [] }
      };
    }
  }

  async getCaptionsContent(captionsUrl) {
    try {
      // For now, return placeholder content since we just generated it
      return this.generatePlaceholderSRT();
    } catch (error) {
      console.error('Failed to fetch captions:', error);
      return '';
    }
  }
}

module.exports = new VideoProcessingService();