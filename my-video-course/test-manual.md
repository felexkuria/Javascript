# 🧪 Manual Testing Guide

## Quick Test Commands

### Test Original Version
```bash
# Terminal 1: Start original server
npm run start-original

# Terminal 2: Test endpoints
npm run test-original
```

### Test Refactored Version
```bash
# Terminal 1: Start refactored server  
npm run start-refactored

# Terminal 2: Test endpoints
npm run test-refactored
```

### Compare Both Versions
```bash
# Automated comparison (starts both servers)
npm run test-comparison
```

## Manual Browser Testing

### Original Version (Port 3001)
- Dashboard: http://localhost:3001/
- Course: http://localhost:3001/course/aws-course
- Video: http://localhost:3001/videos/aws-course/intro
- Profile: http://localhost:3001/profile
- Admin: http://localhost:3001/admin

### Refactored Version (Port 3002)
- Dashboard: http://localhost:3002/
- Course: http://localhost:3002/course/aws-course
- Video: http://localhost:3002/videos/aws-course/intro
- Profile: http://localhost:3002/profile
- Admin: http://localhost:3002/admin

## API Testing

### Test API Endpoints (Both Versions)
```bash
# Health check
curl http://localhost:3001/health
curl http://localhost:3002/health

# Get courses
curl http://localhost:3001/api/courses
curl http://localhost:3002/api/courses

# Get videos
curl http://localhost:3001/api/videos
curl http://localhost:3002/api/videos

# Mark video as watched
curl -X POST http://localhost:3001/api/videos/aws-course/intro/watch
curl -X POST http://localhost:3002/api/videos/aws-course/intro/watch
```

## Expected Results

### ✅ Both Versions Should:
- Serve dashboard at `/`
- Return course data at `/api/courses`
- Return video data at `/api/videos`
- Handle video watching at `/api/videos/:course/:video/watch`
- Show gamification stats at `/api/gamification/stats`
- Serve static files (CSS, JS, images)

### 🔍 Key Differences:
- **File Structure**: Original has everything in root, refactored separates backend/frontend
- **Code Organization**: Refactored has modular controllers/services
- **Same Functionality**: Both should work identically from user perspective

## Troubleshooting

### Port Conflicts
```bash
# Kill processes on ports
lsof -ti:3001 | xargs kill -9
lsof -ti:3002 | xargs kill -9
```

### Missing Dependencies
```bash
# Install backend dependencies
npm run install-backend

# Or manually
cd backend && npm install
```

### Environment Variables
```bash
# Copy environment template
cp backend/.env.example backend/.env
```