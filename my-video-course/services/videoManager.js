const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

class VideoManager {
  constructor() {
    this.videoDir = path.join(__dirname, '..', 'public', 'videos');
    this.thumbnailDir = path.join(__dirname, '..', 'public', 'thumbnails');
    this.dataDir = path.join(__dirname, '..', 'data');
    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.videoDir, this.thumbnailDir, this.dataDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async addVideoFiles() {
    console.log('🎬 Starting comprehensive video processing...');
    
    try {
      const courseFolders = fs.readdirSync(this.videoDir).filter(folder => 
        fs.statSync(path.join(this.videoDir, folder)).isDirectory()
      );

      for (const courseFolder of courseFolders) {
        console.log(`📁 Processing course: ${courseFolder}`);
        await this.processCourse(courseFolder);
      }

      console.log('✅ Video processing completed!');
    } catch (error) {
      console.error('❌ Error in addVideoFiles:', error);
    }
  }

  async processCourse(courseName) {
    const courseDir = path.join(this.videoDir, courseName);
    const videos = [];
    
    // Traverse directory and collect videos with chapter info
    this.traverseDirectory(courseDir, videos, courseName);
    
    if (videos.length === 0) {
      console.log(`No videos found for course: ${courseName}`);
      return;
    }

    // Sort videos by chapter and lesson number
    videos.sort((a, b) => {
      if (a.chapter !== b.chapter) {
        return (a.chapter || '').localeCompare(b.chapter || '');
      }
      const aNum = this.extractNumber(a.title);
      const bNum = this.extractNumber(b.title);
      return aNum - bNum;
    });

    console.log(`Found ${videos.length} videos in ${courseName}`);

    // Process each video
    for (const video of videos) {
      await this.processVideo(video, courseName);
    }

    // Save to MongoDB and localStorage
    await this.saveCourseData(courseName, videos);
    
    // Generate course summary
    await this.generateCourseSummary(courseName, videos);
  }

  traverseDirectory(dir, videos, courseName, chapter = null) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        // Use directory name as chapter
        this.traverseDirectory(filePath, videos, courseName, file);
      } else if (file.toLowerCase().endsWith('.mp4')) {
        const relativePath = path.relative(this.videoDir, filePath);
        const videoId = new ObjectId();
        
        videos.push({
          _id: videoId,
          title: path.basename(file, path.extname(file)),
          description: `Video from ${courseName}`,
          courseName,
          chapter,
          section: chapter,
          videoUrl: relativePath,
          filePath: filePath,
          watched: false,
          watchedAt: null,
          duration: null,
          thumbnailUrl: null,
          srtUrl: null,
          vttUrl: null,
          metadata: {
            fileSize: stat.size,
            createdAt: stat.birthtime,
            modifiedAt: stat.mtime
          }
        });
      }
    });
  }

  async processVideo(video, courseName) {
    console.log(`🎥 Processing: ${video.title}`);
    
    try {
      // Generate thumbnail
      await this.generateThumbnail(video);
      
      // Check for existing SRT/VTT files
      this.checkSubtitleFiles(video);
      
      // Get video duration (if ffprobe is available)
      await this.getVideoDuration(video);
      
      console.log(`✅ Processed: ${video.title}`);
    } catch (error) {
      console.error(`❌ Error processing ${video.title}:`, error.message);
    }
  }

  async generateThumbnail(video) {
    const thumbnailGenerator = require('./thumbnailGenerator');
    
    try {
      const thumbnailUrl = await thumbnailGenerator.generateThumbnail(video.filePath, video._id);
      video.thumbnailUrl = thumbnailUrl;
      console.log(`📸 Generated thumbnail: ${thumbnailUrl}`);
    } catch (error) {
      console.warn(`⚠️ Thumbnail generation failed for ${video.title}:`, error.message);
    }
  }

  checkSubtitleFiles(video) {
    const videoDir = path.dirname(video.filePath);
    const baseName = path.basename(video.filePath, path.extname(video.filePath));
    
    // Check for SRT file
    const srtPath = path.join(videoDir, `${baseName}.srt`);
    if (fs.existsSync(srtPath)) {
      video.srtUrl = path.relative(this.videoDir, srtPath);
      console.log(`📝 Found SRT: ${video.srtUrl}`);
    }
    
    // Check for VTT file
    const vttPath = path.join(videoDir, `${baseName}.vtt`);
    if (fs.existsSync(vttPath)) {
      video.vttUrl = path.relative(this.videoDir, vttPath);
      console.log(`📝 Found VTT: ${video.vttUrl}`);
    }
  }

  async getVideoDuration(video) {
    try {
      const { spawn } = require('child_process');
      
      return new Promise((resolve) => {
        const ffprobe = spawn('ffprobe', [
          '-v', 'quiet',
          '-print_format', 'json',
          '-show_format',
          video.filePath
        ]);
        
        let output = '';
        ffprobe.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        ffprobe.on('close', (code) => {
          if (code === 0) {
            try {
              const info = JSON.parse(output);
              video.duration = parseFloat(info.format.duration);
              console.log(`⏱️ Duration: ${Math.round(video.duration)}s`);
            } catch (e) {
              console.warn(`⚠️ Could not parse duration for ${video.title}`);
            }
          }
          resolve();
        });
        
        ffprobe.on('error', () => {
          console.warn(`⚠️ ffprobe not available for ${video.title}`);
          resolve();
        });
      });
    } catch (error) {
      console.warn(`⚠️ Duration check failed for ${video.title}`);
    }
  }

  async saveCourseData(courseName, videos) {
    // Save to localStorage
    const videoService = require('./videoService');
    const localStorage = videoService.getLocalStorage();
    localStorage[courseName] = videos;
    videoService.saveLocalStorage(localStorage);
    console.log(`💾 Saved ${videos.length} videos to localStorage`);
    
    // Save to MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      try {
        const courseCollection = mongoose.connection.collection(courseName);
        await courseCollection.deleteMany({});
        await courseCollection.insertMany(videos);
        console.log(`🗄️ Saved ${videos.length} videos to MongoDB`);
      } catch (error) {
        console.error(`❌ MongoDB save failed:`, error.message);
      }
    }
  }

  async generateCourseSummary(courseName, videos) {
    const summaryPath = path.join(this.dataDir, 'course_summaries.json');
    let summaries = {};
    
    if (fs.existsSync(summaryPath)) {
      summaries = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    }
    
    const chapters = [...new Set(videos.map(v => v.chapter).filter(Boolean))];
    const totalDuration = videos.reduce((sum, v) => sum + (v.duration || 0), 0);
    
    summaries[courseName] = {
      title: courseName,
      totalVideos: videos.length,
      chapters: chapters.length,
      chapterList: chapters,
      totalDuration: Math.round(totalDuration),
      videosWithThumbnails: videos.filter(v => v.thumbnailUrl).length,
      videosWithSubtitles: videos.filter(v => v.srtUrl || v.vttUrl).length,
      lastUpdated: new Date().toISOString(),
      metadata: {
        avgDuration: Math.round(totalDuration / videos.length) || 0,
        hasChapters: chapters.length > 0
      }
    };
    
    fs.writeFileSync(summaryPath, JSON.stringify(summaries, null, 2));
    console.log(`📊 Generated course summary for ${courseName}`);
  }

  extractNumber(title) {
    const match = title.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  // UI sync method
  async syncUI() {
    console.log('🔄 Starting UI sync...');
    await this.addVideoFiles();
    return {
      success: true,
      message: 'Video sync completed successfully',
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new VideoManager();