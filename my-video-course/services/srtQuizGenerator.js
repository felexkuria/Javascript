const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const aiService = require('./aiService');

class SRTQuizGenerator {
  // Generate SRT file using ffmpeg if it doesn't exist
  async generateSRT(videoPath) {
    const videoDir = path.dirname(videoPath);
    const videoName = path.basename(videoPath, path.extname(videoPath));
    const srtPath = path.join(videoDir, `${videoName}.srt`);
    
    // Check if SRT already exists
    if (fs.existsSync(srtPath)) {
      console.log(`Found existing SRT: ${srtPath}`);
      return srtPath;
    }
    
    // Check for matching SRT file with same name
    try {
      const files = fs.readdirSync(videoDir);
      const srtFiles = files.filter(file => file.endsWith('.srt'));
      
      // First try to find exact match
      const exactMatch = srtFiles.find(file => 
        path.basename(file, '.srt') === videoName
      );
      
      if (exactMatch) {
        const matchingSrt = path.join(videoDir, exactMatch);
        console.log(`Found matching SRT file: ${matchingSrt}`);
        return matchingSrt;
      }
      
      console.log(`No matching SRT found for ${videoName}`);
    } catch (error) {
      console.warn('Error checking for existing SRT files:', error.message);
    }
    
    console.log(`Generating SRT for ${videoPath}`);
    
    return new Promise((resolve, reject) => {
      // Try extracting existing subtitles first
      const ffmpegProcess = spawn('ffmpeg', [
        '-i', videoPath,
        '-map', '0:s:0?',
        '-c:s', 'srt',
        srtPath
      ]);
      
      ffmpegProcess.on('close', (code) => {
        if (fs.existsSync(srtPath) && fs.statSync(srtPath).size > 0) {
          resolve(srtPath);
        } else {
          // Fallback to Whisper
          this.generateWithWhisper(videoPath).then(resolve).catch(reject);
        }
      });
      
      ffmpegProcess.on('error', () => {
        this.generateWithWhisper(videoPath).then(resolve).catch(reject);
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        ffmpegProcess.kill();
        this.generateWithWhisper(videoPath).then(resolve).catch(reject);
      }, 30000);
    });
  }
  
  // Generate SRT using Whisper with audio extraction for speed
  async generateWithWhisper(videoPath) {
    const videoDir = path.dirname(videoPath);
    const videoName = path.basename(videoPath, path.extname(videoPath));
    const srtPath = path.join(videoDir, `${videoName}.srt`);
    const audioPath = path.join(videoDir, `${videoName}_temp.wav`);
    
    // Get video duration and file size for AWS Transcribe decision
    let videoDuration = 0;
    let fileSize = 0;
    try {
      const videoCompression = require('./videoCompression');
      const videoInfo = await videoCompression.getVideoInfo(videoPath);
      videoDuration = videoInfo.duration || 0;
      fileSize = fs.statSync(videoPath).size;
      console.log(`Video duration: ${Math.round(videoDuration / 60)} minutes, size: ${Math.round(fileSize / 1024 / 1024)}MB`);
    } catch (error) {
      console.warn('Could not get video info:', error.message);
    }
    
    // Use AWS Transcribe for videos >= 1 hour (3600 seconds) or >= 200MB
    if (videoDuration >= 3600 || fileSize >= 200 * 1024 * 1024) {
      console.log(`Video is ${Math.round(videoDuration / 60)} minutes or ${Math.round(fileSize / 1024 / 1024)}MB - using AWS Transcribe`);
      try {
        const transcribeService = require('./transcribeService');
        return await transcribeService.processLargeVideo(videoPath, videoName);
      } catch (error) {
        console.warn('AWS Transcribe failed, falling back to Whisper:', error.message);
        // Continue with Whisper as fallback
      }
    }
    
    
    // Extract audio first for faster processing
    let audioExtracted = false;
    try {
      const videoCompression = require('./videoCompression');
      await videoCompression.extractAudio(videoPath, audioPath, { format: 'wav', audioBitrate: '64k' });
      audioExtracted = true;
      console.log(`Extracted audio for faster SRT generation: ${audioPath}`);
    } catch (error) {
      console.warn('Audio extraction failed, using original video:', error.message);
    }
    
    const inputFile = audioExtracted && fs.existsSync(audioPath) ? audioPath : videoPath;
    
    // Calculate timeout based on video duration (minimum 10 minutes, max 30 minutes)
    const timeoutMinutes = Math.max(10, Math.min(30, Math.ceil(videoDuration / 60) * 2));
    const timeoutMs = timeoutMinutes * 60 * 1000;
    console.log(`Using Whisper for ${Math.round(videoDuration / 60)} minute video with ${timeoutMinutes} minute timeout`);
    
    return new Promise((resolve, reject) => {
      const whisperProcess = spawn('whisper', [
        inputFile,
        '--model', 'base',
        '--output_format', 'srt',
        '--output_dir', videoDir,
        '--verbose', 'False'
      ]);
      
      let errorOutput = '';
      let timeoutHandle;
      
      const cleanup = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (audioExtracted && fs.existsSync(audioPath)) {
          try {
            fs.unlinkSync(audioPath);
            console.log('Cleaned up temporary audio file');
          } catch (error) {
            console.warn('Failed to clean up audio file:', error.message);
          }
        }
      };
      
      whisperProcess.stderr.on('data', (data) => {
        const output = data.toString();
        errorOutput += output;
        
        // Parse progress and update global tracking
        const progressMatch = output.match(/(\d+)%/);
        if (progressMatch && global.srtGenerationProgress) {
          const progress = parseInt(progressMatch[1]);
          global.srtGenerationProgress.set(videoName, { status: 'processing', progress });
          console.log(`SRT generation progress for ${videoName}: ${progress}%`);
        }
      });
      
      whisperProcess.on('close', (code) => {
        cleanup();
        
        if (code === 0) {
          const whisperOutput = path.join(videoDir, `${path.basename(inputFile, path.extname(inputFile))}.srt`);
          if (fs.existsSync(whisperOutput) && whisperOutput !== srtPath) {
            fs.renameSync(whisperOutput, srtPath);
          }
          if (fs.existsSync(srtPath)) {
            resolve(srtPath);
          } else {
            reject(new Error('Whisper output not found'));
          }
        } else {
          reject(new Error(`Whisper failed: ${errorOutput}`));
        }
      });
      
      whisperProcess.on('error', (err) => {
        cleanup();
        reject(new Error(`Whisper process error: ${err.message}`));
      });
      
      // Dynamic timeout based on video duration
      timeoutHandle = setTimeout(() => {
        whisperProcess.kill('SIGTERM');
        setTimeout(() => whisperProcess.kill('SIGKILL'), 5000); // Force kill after 5s
        cleanup();
        reject(new Error('Whisper timeout'));
      }, timeoutMs);
    });
  }
  
  // Parse SRT content with timestamps and convert to VTT
  parseSRT(srtPath) {
    if (!fs.existsSync(srtPath)) return [];
    
    const content = fs.readFileSync(srtPath, 'utf8');
    const entries = content.split(/\n\s*\n/).filter(entry => entry.trim());
    
    // Also generate VTT file for HTML5 video
    this.convertSRTtoVTT(srtPath);
    
    return entries.map(entry => {
      const lines = entry.trim().split('\n');
      if (lines.length >= 3) {
        const timestamp = lines[1];
        const text = lines.slice(2).join(' ').trim();
        return { timestamp, text };
      }
      return null;
    }).filter(entry => entry && entry.text.length > 10);
  }
  
  // Convert SRT to VTT format for HTML5 video
  convertSRTtoVTT(srtPath) {
    try {
      const vttPath = srtPath.replace('.srt', '.vtt');
      if (fs.existsSync(vttPath)) return vttPath;
      
      const srtContent = fs.readFileSync(srtPath, 'utf8');
      let vttContent = 'WEBVTT\n\n';
      
      // Convert SRT timestamps to VTT format
      const vttFormatted = srtContent
        .replace(/\r\n/g, '\n')
        .replace(/\d+\n/g, '') // Remove sequence numbers
        .replace(/,/g, '.') // Replace comma with dot in timestamps
        .replace(/^\n+/gm, '') // Remove extra newlines
        .trim();
      
      vttContent += vttFormatted;
      fs.writeFileSync(vttPath, vttContent, 'utf8');
      console.log(`Generated VTT file: ${vttPath}`);
      return vttPath;
    } catch (error) {
      console.warn('Failed to convert SRT to VTT:', error.message);
      return null;
    }
  }
  
  // Generate quiz questions from SRT entries using AI
  async generateQuestions(srtEntries, videoTitle, videoDuration = 0) {
    if (!Array.isArray(srtEntries) || srtEntries.length === 0) return [];
    
    try {
      return await this.generateAIQuestions(srtEntries, videoTitle, videoDuration);
    } catch (error) {
      console.error('AI generation failed:', error.message);
      throw error;
    }
  }
  
  // Generate questions using AI with dynamic count based on video duration
  async generateAIQuestions(srtEntries, videoTitle, videoDuration = 0) {
    // Check if quiz already exists
    try {
      const existingQuiz = await this.getStoredQuiz(videoTitle);
      if (existingQuiz) {
        console.log('Using cached quiz for:', videoTitle);
        return existingQuiz.questions;
      }
    } catch (error) {
      // Continue to generate new quiz
    }
    
    // Calculate number of questions based on video duration
    const durationMinutes = Math.ceil(videoDuration / 60);
    let questionCount = 5; // Default
    
    if (durationMinutes <= 10) {
      questionCount = 3;
    } else if (durationMinutes <= 30) {
      questionCount = 5;
    } else if (durationMinutes <= 60) {
      questionCount = 8;
    } else if (durationMinutes <= 120) {
      questionCount = 12;
    } else {
      questionCount = Math.min(20, Math.ceil(durationMinutes / 10)); // Max 20 questions
    }
    
    console.log(`Generating ${questionCount} questions for ${durationMinutes}-minute video: ${videoTitle}`);
    
    // Use more content for longer videos
    const contentSampleSize = Math.min(srtEntries.length, Math.max(15, Math.ceil(srtEntries.length / 4)));
    const content = srtEntries.slice(0, contentSampleSize).map(e => e.text).join(' ');
    
    const response = await aiService.generateQuizQuestions(content, videoTitle, questionCount);
    
    const jsonMatch = response.match(/\[.*\]/s);
    if (!jsonMatch) throw new Error('No JSON found in response');
    
    // Clean up malformed JSON
    const cleanJson = jsonMatch[0].replace(/,\s*([}\]])/g, '$1');
    const questions = JSON.parse(cleanJson);
    const finalQuestions = questions.slice(0, questionCount).map((q, i) => ({ ...q, id: `ai_${this.hashString(videoTitle)}_${i}` }));
    
    // Store quiz
    try {
      await this.storeQuiz(videoTitle, finalQuestions);
    } catch (error) {
      console.warn('Failed to store quiz:', error);
    }
    
    return finalQuestions;
  }
  
  // Generate summary and key topics from SRT
  async generateSummaryAndTopics(srtEntries, videoTitle) {
    // Check if summary already exists in file system
    try {
      const dataDir = path.join(__dirname, '..', 'data');
      const summaryPath = path.join(dataDir, 'video_summaries.json');
      
      if (fs.existsSync(summaryPath)) {
        const summaries = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
        if (summaries[videoTitle]) {
          console.log('Using cached summary for:', videoTitle);
          return summaries[videoTitle];
        }
      }
    } catch (error) {
      console.warn('Error checking cached summary:', error.message);
    }
    
    // Generate new summary using AI
    const content = srtEntries.map(e => e.text).join(' ');
    const response = await aiService.generateSummaryAndTopics(content, videoTitle);
    
    const jsonMatch = response.match(/\{.*\}/s);
    if (!jsonMatch) throw new Error('No JSON found in response');
    
    // Clean up malformed JSON
    const cleanJson = jsonMatch[0].replace(/,\s*([}\]])/g, '$1');
    const summaryData = JSON.parse(cleanJson);
    
    // Store the generated summary
    try {
      const dataDir = path.join(__dirname, '..', 'data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const summaryPath = path.join(dataDir, 'video_summaries.json');
      
      const summaries = fs.existsSync(summaryPath) ? JSON.parse(fs.readFileSync(summaryPath, 'utf8')) : {};
      summaries[videoTitle] = summaryData;
      fs.writeFileSync(summaryPath, JSON.stringify(summaries, null, 2));
      console.log('Stored summary for:', videoTitle);
    } catch (error) {
      console.warn('Failed to store summary:', error.message);
    }
    
    return summaryData;
  }
  
  // Store quiz in MongoDB
  async storeQuiz(videoTitle, questions) {
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState) {
        const collection = mongoose.connection.collection('video_quizzes');
        await collection.updateOne(
          { videoTitle },
          { $set: { videoTitle, questions, createdAt: new Date().toISOString(), updatedAt: new Date() } },
          { upsert: true }
        );
        return true;
      }
    } catch (error) {
      console.warn('Failed to store quiz:', error);
    }
    return false;
  }
  
  // Get stored quiz from MongoDB
  async getStoredQuiz(videoTitle) {
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState) {
        const collection = mongoose.connection.collection('video_quizzes');
        const quiz = await collection.findOne({ videoTitle });
        return quiz;
      }
    } catch (error) {
      console.warn('Failed to get stored quiz:', error);
    }
    return null;
  }
  
  // Hash string for consistent IDs
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}

module.exports = new SRTQuizGenerator();