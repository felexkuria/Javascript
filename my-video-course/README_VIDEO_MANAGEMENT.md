# 🎬 Video Management System

Complete video processing system with thumbnails, metadata, and gamification.

## 🚀 Quick Start

### 1. Move Videos to Public Folder
```bash
# Move your course videos to the public/videos directory
mv "/Users/felexirungu/Downloads/HashiCorp Certified Terraform Associate - Hands-On Labs/" "/Users/felexirungu/Downloads/ProjectLevi/Javascript/my-video-course/public/videos/"
```

### 2. Process Videos
```bash
# Option 1: Run the processing script
node scripts/processVideos.js

# Option 2: Use the admin UI
# Visit http://localhost:3000/admin and click "Process All Videos"
```

## 📁 Features

### ✅ Video Processing
- **Automatic Discovery**: Scans all course directories
- **Chapter Organization**: Organizes videos by subdirectories
- **Metadata Extraction**: File size, duration, creation date
- **Thumbnail Generation**: Creates thumbnails for all videos
- **Subtitle Detection**: Finds .srt and .vtt files automatically

### ✅ Storage & Sync
- **MongoDB Integration**: Stores all metadata in MongoDB
- **localStorage Backup**: Works offline with localStorage
- **Dual Storage**: Syncs between MongoDB and localStorage
- **Course Summaries**: Generates comprehensive course metadata

### ✅ Gamification System
- **Points System**: Awards points for video watching and quiz completion
- **Achievements**: Unlocks badges and achievements
- **Streak Tracking**: Daily study streak monitoring
- **Level System**: User progression with levels
- **Statistics**: Comprehensive learning analytics

## 🎯 Usage

### Admin Panel
Visit `http://localhost:3000/admin` to:
- Process all videos with one click
- Monitor processing progress
- View system statistics
- Check MongoDB connection status

### API Endpoints

#### Video Management
```javascript
// Process all videos
POST /api/videos/sync

// Get processing status
GET /api/videos/process-status

// Get course summary
GET /api/course/summary/:courseName
```

#### Gamification
```javascript
// Record video watch
POST /api/gamification/video-watched
{
  "courseName": "Course Name",
  "videoTitle": "Video Title",
  "userId": "user_id"
}

// Record quiz completion
POST /api/gamification/quiz-completed
{
  "score": 8,
  "totalQuestions": 10,
  "userId": "user_id"
}

// Load user data
GET /api/gamification/load?userId=user_id
```

## 📊 Data Structure

### Video Metadata
```json
{
  "_id": "ObjectId",
  "title": "Video Title",
  "courseName": "Course Name",
  "chapter": "Chapter Name",
  "videoUrl": "relative/path/to/video.mp4",
  "thumbnailUrl": "/thumbnails/video_id.jpg",
  "srtUrl": "relative/path/to/subtitles.srt",
  "vttUrl": "relative/path/to/subtitles.vtt",
  "duration": 1234.56,
  "watched": false,
  "watchedAt": null,
  "metadata": {
    "fileSize": 123456789,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "modifiedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Course Summary
```json
{
  "title": "Course Name",
  "totalVideos": 50,
  "chapters": 8,
  "chapterList": ["Chapter 1", "Chapter 2"],
  "totalDuration": 18000,
  "videosWithThumbnails": 50,
  "videosWithSubtitles": 45,
  "lastUpdated": "2024-01-01T00:00:00.000Z",
  "metadata": {
    "avgDuration": 360,
    "hasChapters": true
  }
}
```

### Gamification Data
```json
{
  "userId": "default_user",
  "level": 5,
  "totalPoints": 4500,
  "streak": 7,
  "achievements": [
    {
      "id": "level_5",
      "title": "Level 5 Reached!",
      "description": "You've reached level 5",
      "earnedAt": "2024-01-01T00:00:00.000Z",
      "points": 100
    }
  ],
  "stats": {
    "videosWatched": 45,
    "coursesCompleted": 2,
    "quizzesTaken": 30,
    "perfectQuizzes": 15,
    "studyDays": 7
  }
}
```

## 🔧 Configuration

### Environment Variables
```bash
# MongoDB (optional - works offline without it)
MONGODB_URI=mongodb://localhost:27017/video-course-db

# AI Services (for enhanced features)
GEMINI_API_KEY=your_gemini_key
NOVA_API_KEY=your_nova_key
```

### Directory Structure
```
public/
├── videos/
│   ├── Course 1/
│   │   ├── Chapter 1/
│   │   │   ├── 001 Video.mp4
│   │   │   ├── 001 Video.srt
│   │   │   └── 002 Video.mp4
│   │   └── Chapter 2/
│   └── Course 2/
├── thumbnails/
│   ├── video_id_1.jpg
│   └── video_id_2.jpg
└── data/
    ├── localStorage.json
    ├── course_summaries.json
    └── gamification.json
```

## 🎮 Gamification Features

### Point System
- **Video Watch**: 50 points
- **Quiz Completion**: Up to 200 points (based on score)
- **Perfect Quiz**: +100 bonus points
- **Daily Streak**: 10 points per day
- **Level Up**: 100 points bonus

### Achievements
- **Level Milestones**: Every 1000 points = new level
- **Perfect Scores**: 100% quiz completion
- **Study Streaks**: 7, 14, 30+ day streaks
- **Course Completion**: Finish entire courses

### Statistics Tracking
- Videos watched count
- Courses completed
- Quiz performance
- Study consistency
- Learning progress

## 🚀 Advanced Usage

### Batch Processing
```bash
# Process specific course
node -e "
const vm = require('./services/videoManager');
vm.processCourse('Course Name').then(() => console.log('Done'));
"

# Generate thumbnails only
node -e "
const tg = require('./services/thumbnailGenerator');
// Custom thumbnail generation logic
"
```

### Custom Integrations
```javascript
// Custom gamification events
const gm = require('./services/gamificationManager');

// Award custom points
await gm.awardPoints('user_id', 100, 'custom achievement');

// Record custom activity
await gm.updateUserData('user_id', {
  customStat: 'value'
});
```

## 📈 Monitoring

### Admin Dashboard
- Real-time processing status
- System health monitoring
- Storage usage statistics
- User activity metrics

### Logs
- Processing logs in admin UI
- Console output for debugging
- Error tracking and reporting
- Performance monitoring

## 🔄 Sync & Backup

### Automatic Sync
- MongoDB ↔ localStorage sync
- Real-time data consistency
- Offline mode support
- Automatic reconnection

### Manual Sync
```bash
# Force sync all data
curl -X POST http://localhost:3000/api/sync

# Sync specific video
curl -X POST http://localhost:3000/api/force-sync-video \
  -H "Content-Type: application/json" \
  -d '{"courseName": "Course", "videoTitle": "Video"}'
```

This system provides a complete video learning platform with professional-grade features for content management, user engagement, and progress tracking.