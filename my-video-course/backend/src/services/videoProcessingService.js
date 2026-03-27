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
    const tempDir = path.join(os.tmpdir(), `upload-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      const isPdf = videoFile.mimetype === 'application/pdf' || videoFile.originalname.toLowerCase().endsWith('.pdf');
      const ext = isPdf ? '.pdf' : '.mp4';
      const contentType = isPdf ? 'application/pdf' : 'video/mp4';

      // Save original file
      const originalPath = path.join(tempDir, 'original' + ext);
      fs.writeFileSync(originalPath, videoFile.buffer);

      let s3Key = '';
      let videoUrl = '';
      let captionsUrl = '';
      let aiContent = { quiz: { questions: [] }, summary: '', todoList: { tasks: [] } };

      const sanitize = (str) => (str || 'unnamed').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9._-]/g, '');
      const safeCourse = sanitize(courseName);
      const safeTitle = sanitize(title);

      if (isPdf) {
        s3Key = `resources/${safeCourse}/${Date.now()}-${safeTitle}${ext}`;
        videoUrl = await this.uploadToS3(originalPath, s3Key, contentType);
      } else {
        // Compress video
        const compressedPath = await this.compressVideo(originalPath, tempDir);
        s3Key = `videos/${safeCourse}/${Date.now()}-${safeTitle}${ext}`;
        videoUrl = await this.uploadToS3(compressedPath, s3Key, contentType);

        // Generate captions
        captionsUrl = await this.generateCaptions(videoUrl, s3Key, tempDir);

        // Generate visual previews (Phase 1: Leapfrog)
        const previews = await this.generateVideoPreviews(originalPath, tempDir, safeCourse, safeTitle);
        
        // Generate AI content (Updated to include visual context)
        aiContent = await this.generateAIContent(captionsUrl, courseName, title, previews);
      }

      // Extract metadata
      let duration = '0:00';
      if (isPdf) {
        const pages = await this.getPdfPageCount(originalPath);
        duration = `${pages} Pages`;
      } else {
        const seconds = await this.getVideoDuration(originalPath);
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        duration = `${mins}:${secs.toString().padStart(2, '0')}`;
      }

      // Save to DynamoDB
      const videoData = {
        _id: Date.now().toString(),
        courseName,
        title,
        videoUrl,
        s3Key,
        captionsUrl,
        duration, // Store extracted duration/pages here
        type: isPdf ? 'pdf' : 'video',
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

  async getVideoDuration(inputPath) {
    return new Promise((resolve) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        inputPath
      ]);

      let output = '';
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0 && output.trim()) {
          resolve(parseFloat(output.trim()) || 0);
        } else {
          console.warn('ffprobe failed, using 0 duration');
          resolve(0);
        }
      });

      ffprobe.on('error', () => resolve(0));
    });
  }

  async getPdfPageCount(inputPath) {
    return new Promise((resolve) => {
      const pdfinfo = spawn('pdfinfo', [inputPath]);

      let output = '';
      pdfinfo.stdout.on('data', (data) => {
        output += data.toString();
      });

      pdfinfo.on('close', (code) => {
        if (code === 0) {
          const match = output.match(/Pages:\s+(\d+)/);
          resolve(match ? parseInt(match[1]) : 0);
        } else {
          console.warn('pdfinfo failed, using 0 pages');
          resolve(0);
        }
      });

      pdfinfo.on('error', () => resolve(0));
    });
  }

  async uploadToS3(filePath, s3Key, contentType = 'video/mp4') {
    if (!this.bucketName) {
      throw new Error('S3_BUCKET_NAME not configured');
    }
    
    const fileBuffer = fs.readFileSync(filePath);
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: contentType
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

  async generateVideoPreviews(inputPath, tempDir, safeCourse, safeTitle) {
    const previewDir = path.join(tempDir, 'previews');
    fs.mkdirSync(previewDir, { recursive: true });

    return new Promise((resolve) => {
      // Extract frame every 30 seconds
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-vf', 'fps=1/30',
        '-q:v', '2',
        path.join(previewDir, 'thumb_%03d.jpg')
      ]);

      ffmpeg.on('close', async (code) => {
        if (code !== 0) {
           console.warn('Frame extraction failed');
           return resolve([]);
        }

        const files = fs.readdirSync(previewDir);
        const uploadPromises = files.map(async (file, index) => {
          const s3Key = `previews/${safeCourse}/${safeTitle}/${Date.now()}-${file}`;
          return await this.uploadToS3(path.join(previewDir, file), s3Key, 'image/jpeg');
        });

        const urls = await Promise.all(uploadPromises);
        resolve(urls);
      });

      ffmpeg.on('error', () => resolve([]));
    });
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

  async generateAIContent(captionsUrl, courseName, title, previews = []) {
    try {
      // Get captions content
      const captionsContent = await this.getCaptionsContent(captionsUrl);
      
      // Generate AI content (Phase 1: Passing previews to multimodal analysis)
      const [quiz, summary, todoList, visualInsights] = await Promise.all([
        aiService.generateQuizFromVideo(title, captionsContent),
        aiService.summarizeFromSRT(captionsContent, title),
        aiService.generateTodos(captionsContent, 'video', title),
        aiService.analyzeVisualContent(title, previews)
      ]);

      return { quiz, summary, todoList, visualInsights };
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