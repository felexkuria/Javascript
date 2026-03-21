const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

class VideoCompressionService {
  constructor() {
    // Set FFmpeg path if needed (uncomment and adjust path as needed)
    // ffmpeg.setFfmpegPath('/usr/local/bin/ffmpeg');
    // ffmpeg.setFfprobePath('/usr/local/bin/ffprobe');
    
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    
    this.bucket = process.env.S3_BUCKET_NAME;
  }

  async compressVideo(inputPath, outputPath, options = {}) {
    const defaultOptions = {
      videoBitrate: '1000k',
      audioBitrate: '128k',
      resolution: '720p',
      crf: 23, // Constant Rate Factor (18-28, lower = better quality)
      preset: 'medium', // ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow
      format: 'mp4'
    };

    const settings = { ...defaultOptions, ...options };

    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .videoBitrate(settings.videoBitrate)
        .audioBitrate(settings.audioBitrate)
        .addOption('-crf', settings.crf)
        .addOption('-preset', settings.preset)
        .format(settings.format);

      // Set resolution if specified
      if (settings.resolution) {
        const resolutions = {
          '480p': '854x480',
          '720p': '1280x720',
          '1080p': '1920x1080'
        };
        
        if (resolutions[settings.resolution]) {
          command = command.size(resolutions[settings.resolution]);
        }
      }

      command
        .on('start', (commandLine) => {
          console.log('FFmpeg compression started:', commandLine);
        })
        .on('progress', (progress) => {
          console.log(`Compression progress: ${Math.round(progress.percent || 0)}%`);
        })
        .on('end', () => {
          console.log('Video compression completed');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('FFmpeg compression error:', err);
          reject(err);
        })
        .save(outputPath);
    });
  }

  async extractAudio(inputPath, outputPath, options = {}) {
    const defaultOptions = {
      audioBitrate: '64k', // Lower bitrate for faster processing
      format: 'wav',
      audioChannels: 2,
      audioSampleRate: 44100
    };

    const settings = { ...defaultOptions, ...options };

    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath).noVideo();
      
      if (settings.format === 'wav') {
        // Use pcm_s16le for better compatibility
        command = command.audioCodec('pcm_s16le').format('wav');
      } else {
        command = command.audioCodec('aac').format('mp4');
      }
      
      command.audioBitrate(settings.audioBitrate)
        .audioChannels(settings.audioChannels)
        .audioFrequency(settings.audioSampleRate)
        // Add audio filters for better processing
        .audioFilters('highpass=f=200,lowpass=f=3000')
        .on('start', (commandLine) => {
          console.log('Audio extraction started:', commandLine);
        })
        .on('progress', (progress) => {
          console.log(`Audio extraction progress: ${Math.round(progress.percent || 0)}%`);
        })
        .on('end', () => {
          console.log('Audio extraction completed');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('Audio extraction error:', err);
          // Try fallback without filters
          console.log('Retrying audio extraction without filters...');
          
          let fallbackCommand = ffmpeg(inputPath).noVideo();
          if (settings.format === 'wav') {
            fallbackCommand = fallbackCommand.audioCodec('pcm_s16le').format('wav');
          } else {
            fallbackCommand = fallbackCommand.audioCodec('aac').format('mp4');
          }
          
          fallbackCommand.audioBitrate(settings.audioBitrate)
            .audioChannels(settings.audioChannels)
            .audioFrequency(settings.audioSampleRate)
            .on('end', () => {
              console.log('Fallback audio extraction completed');
              resolve(outputPath);
            })
            .on('error', (fallbackErr) => {
              console.error('Fallback audio extraction also failed:', fallbackErr);
              reject(fallbackErr);
            })
            .save(outputPath);
        })
        .save(outputPath);
    });
  }

  async getVideoInfo(inputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');

        const info = {
          duration: metadata.format.duration,
          size: metadata.format.size,
          bitrate: metadata.format.bit_rate,
          video: videoStream ? {
            codec: videoStream.codec_name,
            width: videoStream.width,
            height: videoStream.height,
            fps: eval(videoStream.r_frame_rate),
            bitrate: videoStream.bit_rate
          } : null,
          audio: audioStream ? {
            codec: audioStream.codec_name,
            bitrate: audioStream.bit_rate,
            sampleRate: audioStream.sample_rate,
            channels: audioStream.channels
          } : null
        };

        resolve(info);
      });
    });
  }

  async compressVideoForCourse(courseName, videoFileName, compressionLevel = 'medium') {
    const inputDir = path.join(process.cwd(), 'public', 'videos', courseName);
    const inputPath = path.join(inputDir, videoFileName);
    
    // Create output directory structure matching input structure
    const videoDir = path.dirname(videoFileName);
    const videoBaseName = path.basename(videoFileName);
    const outputDir = path.join(inputDir, 'compressed', videoDir);
    
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    const outputFileName = `compressed_${videoBaseName}`;
    const outputPath = path.join(outputDir, outputFileName);

    // Check if input file exists
    try {
      await fs.access(inputPath);
    } catch (error) {
      throw new Error(`Input video file not found: ${inputPath}`);
    }

    // Compression settings based on level
    const compressionSettings = {
      low: {
        videoBitrate: '2000k',
        audioBitrate: '192k',
        resolution: '1080p',
        crf: 20,
        preset: 'slow'
      },
      medium: {
        videoBitrate: '1000k',
        audioBitrate: '128k',
        resolution: '720p',
        crf: 23,
        preset: 'medium'
      },
      high: {
        videoBitrate: '500k',
        audioBitrate: '96k',
        resolution: '480p',
        crf: 28,
        preset: 'fast'
      }
    };

    const settings = compressionSettings[compressionLevel] || compressionSettings.medium;

    try {
      // Get original video info
      const originalInfo = await this.getVideoInfo(inputPath);
      console.log('Original video info:', originalInfo);

      // Compress video
      await this.compressVideo(inputPath, outputPath, settings);

      // Get compressed video info
      const compressedInfo = await this.getVideoInfo(outputPath);
      console.log('Compressed video info:', compressedInfo);

      const compressionRatio = ((originalInfo.size - compressedInfo.size) / originalInfo.size * 100).toFixed(2);
      
      return {
        success: true,
        originalPath: inputPath,
        compressedPath: outputPath,
        originalSize: originalInfo.size,
        compressedSize: compressedInfo.size,
        compressionRatio: `${compressionRatio}%`,
        settings: settings
      };

    } catch (error) {
      console.error('Video compression failed:', error);
      throw error;
    }
  }

  async batchCompressVideos(courseName, compressionLevel = 'medium', progressCallback = null) {
    const inputDir = path.join(process.cwd(), 'public', 'videos', courseName);
    
    try {
      const files = await fs.readdir(inputDir);
      const videoFiles = files.filter(file => 
        file.toLowerCase().endsWith('.mp4') && 
        !file.startsWith('compressed_')
      );

      const results = [];
      let processed = 0;

      for (const videoFile of videoFiles) {
        try {
          console.log(`Compressing ${videoFile}...`);
          const result = await this.compressVideoForCourse(courseName, videoFile, compressionLevel);
          results.push(result);
          processed++;

          if (progressCallback) {
            progressCallback({
              processed,
              total: videoFiles.length,
              currentFile: videoFile,
              result
            });
          }

        } catch (error) {
          console.error(`Failed to compress ${videoFile}:`, error);
          results.push({
            success: false,
            file: videoFile,
            error: error.message
          });
        }
      }

      return {
        success: true,
        totalFiles: videoFiles.length,
        processed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      };

    } catch (error) {
      console.error('Batch compression failed:', error);
      throw error;
    }
  }

  async uploadVideoToS3(videoPath, s3Key) {
    try {
      if (!this.bucket) {
        throw new Error('S3_BUCKET_NAME environment variable not set');
      }

      console.log(`Uploading video to S3: ${videoPath}`);
      const fileStream = require('fs').createReadStream(videoPath);
      const stats = await fs.stat(videoPath);
      
      const params = {
        Bucket: this.bucket,
        Key: s3Key,
        Body: fileStream,
        ContentType: 'video/mp4',
        ContentLength: stats.size
      };
      
      const result = await this.s3Client.send(new PutObjectCommand(params));
      const s3Url = `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
      
      console.log(`Video uploaded successfully: ${s3Url}`);
      return {
        success: true,
        s3Url,
        s3Key,
        fileSize: stats.size
      };
    } catch (error) {
      console.error('S3 upload failed:', error);
      throw error;
    }
  }

  async compressAndUploadToS3(courseName, videoFileName, compressionLevel = 'medium', deleteOriginal = false) {
    try {
      // First compress the video
      const compressionResult = await this.compressVideoForCourse(courseName, videoFileName, compressionLevel);
      
      if (!compressionResult.success) {
        throw new Error('Video compression failed');
      }
      
      // Generate S3 key with course-based folder structure
      const s3Key = `courses/${courseName}/videos/${path.basename(videoFileName)}`;
      const thumbnailKey = `courses/${courseName}/thumbnails/${path.basename(videoFileName, path.extname(videoFileName))}.jpg`;
      
      // Upload compressed video to S3
      const uploadResult = await this.uploadVideoToS3(compressionResult.compressedPath, s3Key);
      
      // Generate and upload thumbnail
      let thumbnailResult = null;
      try {
        const thumbnailPath = await this.generateThumbnail(compressionResult.compressedPath);
        thumbnailResult = await this.uploadVideoToS3(thumbnailPath, thumbnailKey);
        await fs.unlink(thumbnailPath); // Clean up local thumbnail
      } catch (thumbError) {
        console.warn('Thumbnail generation failed:', thumbError.message);
      }
      
      // Delete original if requested
      if (deleteOriginal) {
        try {
          await fs.unlink(compressionResult.originalPath);
          console.log(`Deleted original video: ${compressionResult.originalPath}`);
        } catch (deleteError) {
          console.warn('Failed to delete original video:', deleteError.message);
        }
      }
      
      // Clean up compressed file
      try {
        await fs.unlink(compressionResult.compressedPath);
        console.log(`Cleaned up compressed file: ${compressionResult.compressedPath}`);
      } catch (cleanupError) {
        console.warn('Failed to clean up compressed file:', cleanupError.message);
      }
      
      return {
        success: true,
        compression: compressionResult,
        upload: uploadResult,
        thumbnailUrl: thumbnailResult?.s3Url,
        s3Structure: {
          videoPath: s3Key,
          thumbnailPath: thumbnailKey,
          transcriptionPath: `courses/${courseName}/transcriptions/${path.basename(videoFileName, path.extname(videoFileName))}.srt`
        }
      };
    } catch (error) {
      console.error('Compress and upload failed:', error);
      throw error;
    }
  }

  async generateThumbnail(videoPath) {
    const outputPath = videoPath.replace(path.extname(videoPath), '_thumb.jpg');
    
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: ['10%'],
          filename: path.basename(outputPath),
          folder: path.dirname(outputPath),
          size: '1280x720'
        })
        .on('end', () => resolve(outputPath))
        .on('error', reject);
    });
  }
}

module.exports = new VideoCompressionService();