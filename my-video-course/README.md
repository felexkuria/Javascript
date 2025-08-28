# 🎬 Video Course Platform - Refactored Architecture

## 📁 Project Structure

```
my-video-course/
├── backend/                    # Backend Service
│   ├── src/
│   │   ├── controllers/       # Request handlers
│   │   │   ├── courseController.js
│   │   │   ├── videoController.js
│   │   │   └── webController.js
│   │   ├── routes/
│   │   │   ├── api/          # API routes (/api/*)
│   │   │   │   ├── courses.js
│   │   │   │   ├── videos.js
│   │   │   │   ├── gamification.js
│   │   │   │   └── ai.js
│   │   │   └── web.js        # Web routes (existing)
│   │   ├── services/         # Business logic
│   │   │   ├── courseService.js
│   │   │   ├── videoService.js
│   │   │   └── gamificationManager.js
│   │   ├── utils/            # Helper functions
│   │   │   └── database.js
│   │   ├── app.js            # Express app
│   │   └── server.js         # Entry point
│   ├── package.json          # Backend dependencies
│   └── .env.example          # Environment template
├── frontend/                  # Frontend Assets
│   ├── public/               # Static files
│   │   ├── videos/          # Video files
│   │   ├── thumbnails/      # Video thumbnails
│   │   ├── css/             # Stylesheets
│   │   └── js/              # Client scripts
│   └── views/               # EJS templates
│       ├── dashboard.ejs
│       ├── course.ejs
│       ├── video.ejs
│       └── partials/
├── data/                     # Data storage
│   ├── localStorage.json    # Video data
│   └── gamification.json   # User progress
├── terraform/               # Infrastructure (unchanged)
├── Dockerfile              # Updated for new structure
└── package.json            # Root package (points to backend)
```

## 🚀 Quick Start

### Local Development
```bash
# Install backend dependencies
npm run install-backend

# Start development server
npm run dev

# Production
npm start
```

### Environment Setup
```bash
# Copy environment template
cp backend/.env.example backend/.env

# Edit with your configuration
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb://...
AWS_REGION=us-east-1
GEMINI_API_KEY=your-key
```

## 🔌 API Endpoints

### Web Routes (Existing Frontend)
- `GET /` - Dashboard
- `GET /course/:courseName` - Course view  
- `GET /videos/:courseName/:videoId` - Video player
- `GET /profile` - User profile
- `GET /admin` - Admin panel

### API Routes (Mobile Ready)
- `GET /api/courses` - List all courses
- `GET /api/courses/:courseName` - Get course details
- `GET /api/videos` - List all videos
- `GET /api/videos/course/:courseName` - Videos by course
- `GET /api/videos/:courseName/:videoId` - Get specific video
- `POST /api/videos/:courseName/:videoId/watch` - Mark as watched

### Gamification API
- `GET /api/gamification/stats` - User statistics
- `POST /api/gamification/sync` - Sync progress

## 📱 Mobile Integration

### API Usage Example
```javascript
// Fetch courses
const response = await fetch('/api/courses');
const data = await response.json();
console.log(data.data); // courses array

// Get course videos
const videos = await fetch('/api/videos/course/aws-course');
const videoData = await videos.json();

// Mark video as watched
await fetch('/api/videos/aws-course/video123/watch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
});
```

### Response Format
```json
{
  "success": true,
  "data": { ... },
  "message": "Success"
}
```

## 🏗️ Architecture Benefits

### ✅ **Clean Separation**
- **Backend**: Pure API service with business logic
- **Frontend**: Static assets and EJS templates  
- **Data**: Centralized in `/data` folder
- **Services**: Modular business logic

### ✅ **Mobile Ready**
- **RESTful APIs** for mobile consumption
- **JSON responses** for all data
- **Consistent error handling**
- **Standardized response format**

### ✅ **Maintained Compatibility**
- **Existing routes** still work
- **Same deployment process**
- **Same Docker configuration**
- **Same Terraform infrastructure**

### ✅ **Environment Configuration**
- **All settings** in environment variables
- **No hardcoded values**
- **Development/production** separation
- **Secure credential management**

## 🚢 Deployment

### Existing EC2 Workflow (Unchanged)
```bash
git push origin main
# Triggers GitHub Actions
# Builds Docker image  
# Deploys to EC2 Auto Scaling Group
```

### Docker Build
```bash
# Build image
docker build -t video-course-app .

# Run locally
docker run -p 3000:3000 video-course-app
```

## 🔧 Configuration

### Backend Environment Variables
```bash
# Server
NODE_ENV=production
PORT=3000

# Database  
MONGODB_URI=mongodb://...

# AWS Services
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=...

# AI Services
GEMINI_API_KEY=...
NOVA_API_KEY=...

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

## 📊 Data Storage

### Local Storage (Primary)
- **localStorage.json** - Video data and progress
- **gamification.json** - User achievements and stats
- **Offline capable** - Works without database

### MongoDB (Secondary)
- **Automatic sync** when available
- **Fallback support** for offline mode
- **Consistent data** across environments

## 🧪 Testing

```bash
# Test backend
cd backend
npm test

# Test API endpoints
curl http://localhost:3000/api/courses
curl http://localhost:3000/health
```

## 📈 Performance

### Optimizations
- **File-based storage** for fast access
- **Caching** for course data
- **Static file serving** optimized
- **Minimal dependencies**

### Monitoring
- **Health endpoint** at `/health`
- **Request logging** in development
- **Error tracking** with proper status codes

---

**The refactored architecture maintains 100% compatibility while providing clean separation and mobile-ready APIs.**