# 📦 localStorage to MongoDB Migration Guide

This guide helps you migrate user data from localStorage to MongoDB, consolidating all course enrollments, progress, and video metadata for the user `engineerfelex@gmail.com`.

## 🎯 Migration Overview

**What gets migrated:**
- ✅ Course enrollments and progress
- ✅ Video watch status and metadata  
- ✅ Gamification data (points, levels, streaks)
- ✅ User achievements and statistics
- ✅ Todo progress data

**Target User:** `engineerfelex@gmail.com`

## 🚀 Migration Methods

### Method 1: Direct Script Migration (Recommended)

Run the migration script directly on the server:

```bash
# Navigate to project root
cd /path/to/my-video-course

# Run migration script
node backend/src/scripts/localStorage-migration.js
```

**What it does:**
1. Connects to MongoDB using `MONGO_URI` from `.env`
2. Reads data from `data/localStorage.json` and `data/gamification.json`
3. Transforms and merges data into MongoDB collections
4. Creates/updates user and enrollment records
5. Provides detailed verification logs

### Method 2: Frontend API Migration

For live users to migrate their own data:

1. **Add export script to frontend:**
```html
<script src="/frontend-localStorage-export.js"></script>
```

2. **User runs in browser console:**
```javascript
// Export and send to backend
sendLocalStorageToBackend()
  .then(result => console.log('Migration successful:', result))
  .catch(error => console.error('Migration failed:', error));
```

3. **API endpoint handles migration:**
- `POST /api/migrate/localStorage` - Receives and processes data
- `GET /api/migrate/status/:email` - Check migration status

### Method 3: Manual JSON Import

If you have exported localStorage data:

```bash
# Test migration with custom data
node test-migration.js
```

## 📊 Data Transformation

### localStorage → MongoDB Mapping

| localStorage | MongoDB Collection | Field |
|-------------|-------------------|-------|
| Course arrays | `enrollments` | `courseId`, `progress`, `completedLectures` |
| Video watch status | `enrollments` | `completedLectures[].lectureId` |
| Gamification data | `users` | `gamification.userStats` |
| User achievements | `users` | `gamification.achievements` |
| Streak data | `users` | `gamification.streakData` |

### Example Transformation

**Before (localStorage):**
```json
{
  "AWS Course": [
    {
      "_id": "video123",
      "title": "Introduction to AWS",
      "watched": true,
      "watchedAt": "2025-01-15T10:30:00Z"
    }
  ]
}
```

**After (MongoDB):**
```json
{
  "userId": "engineerfelex@gmail.com",
  "courseId": "AWS Course", 
  "progress": 25,
  "completedLectures": [
    {
      "lectureId": "video123",
      "completedAt": "2025-01-15T10:30:00Z"
    }
  ]
}
```

## 🔍 Verification Steps

After migration, verify data integrity:

```bash
# Check migration status
curl http://localhost:3002/api/migrate/status/engineerfelex@gmail.com

# Or run verification script
node -e "
const { verifyMigration } = require('./backend/src/scripts/localStorage-migration');
verifyMigration().then(() => process.exit(0));
"
```

**Expected Output:**
```
📊 MIGRATION VERIFICATION:
========================
👤 User: Felix Engineer (engineerfelex@gmail.com)
🎮 Gamification:
   - Total Points: 2596
   - Current Level: 7
   - Videos Watched: 6
   - Current Streak: 1

📚 Enrollments (3 courses):
   - AWS Course
     Progress: 45%
     Completed Lectures: 12
     Status: active
```

## 🛠️ Troubleshooting

### Common Issues

**1. MongoDB Connection Failed**
```bash
# Check .env file
cat backend/.env | grep MONGODB_URI

# Test connection
node -e "
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI || 'your-uri')
  .then(() => console.log('✅ Connected'))
  .catch(err => console.error('❌ Failed:', err.message));
"
```

**2. Data Not Found**
```bash
# Check if data files exist
ls -la data/localStorage.json
ls -la data/gamification.json

# Verify file contents
head -n 20 data/localStorage.json
```

**3. Duplicate Enrollments**
The migration script handles duplicates automatically by:
- Checking existing enrollments by `userId` + `courseId`
- Merging completed lectures without duplicates
- Taking the maximum progress value

**4. User Not Created**
```javascript
// Manual user creation
const User = require('./backend/src/models/User');
const user = new User({
  userId: 'engineerfelex@gmail.com',
  name: 'Felix Engineer', 
  email: 'engineerfelex@gmail.com',
  roles: ['student']
});
await user.save();
```

## 🔄 Future-Proofing

### Remove localStorage Dependencies

1. **Update frontend code:**
```javascript
// OLD: localStorage usage
localStorage.setItem('courseProgress', JSON.stringify(data));

// NEW: API calls
await fetch('/api/enrollments/progress', {
  method: 'POST',
  body: JSON.stringify(data)
});
```

2. **Update video watch tracking:**
```javascript
// OLD: localStorage
const watched = JSON.parse(localStorage.getItem('watchedVideos') || '{}');

// NEW: MongoDB API
const response = await fetch('/api/videos/progress');
const { watchedVideos } = await response.json();
```

3. **Update gamification:**
```javascript
// OLD: localStorage
const stats = JSON.parse(localStorage.getItem('userStats') || '{}');

// NEW: MongoDB API  
const response = await fetch('/api/gamification/stats');
const stats = await response.json();
```

## 📋 Migration Checklist

- [ ] ✅ MongoDB connection configured in `.env`
- [ ] ✅ Data files exist (`localStorage.json`, `gamification.json`)
- [ ] ✅ Run migration script: `node backend/src/scripts/localStorage-migration.js`
- [ ] ✅ Verify user created in MongoDB
- [ ] ✅ Verify enrollments created with correct progress
- [ ] ✅ Verify gamification data migrated
- [ ] ✅ Test frontend with MongoDB APIs
- [ ] ✅ Remove localStorage dependencies from frontend
- [ ] ✅ Update authentication to use MongoDB user data
- [ ] ✅ Test video progress tracking
- [ ] ✅ Test course completion workflows

## 🚨 Rollback Plan

If migration fails, you can rollback:

1. **Restore from backup:**
```bash
# If you backed up before migration
mongorestore --uri="your-mongodb-uri" backup/
```

2. **Clear migrated data:**
```javascript
// Remove migrated user and enrollments
await User.deleteOne({ email: 'engineerfelex@gmail.com' });
await Enrollment.deleteMany({ userId: 'engineerfelex@gmail.com' });
```

3. **Keep localStorage as fallback:**
```javascript
// Hybrid approach during transition
const getProgress = async () => {
  try {
    const response = await fetch('/api/progress');
    return await response.json();
  } catch (error) {
    // Fallback to localStorage
    return JSON.parse(localStorage.getItem('progress') || '{}');
  }
};
```

## 📞 Support

If you encounter issues:

1. Check the migration logs for specific error messages
2. Verify MongoDB connection and credentials
3. Ensure all required models are properly defined
4. Test with a smaller dataset first
5. Contact the development team with error logs

---

**✅ Migration Complete!** 

Your user data is now consolidated in MongoDB. All course progress, video metadata, and gamification data for `engineerfelex@gmail.com` is stored centrally and accessible via the API.