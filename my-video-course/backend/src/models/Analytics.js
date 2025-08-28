const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
  type: { 
    type: String, 
    enum: ['enrollment', 'video_watch', 'quiz_completion', 'course_completion', 'login', 'course_created'],
    required: true 
  },
  userId: String,
  userEmail: String,
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  lectureId: String,
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' },
  
  // Event data
  data: {
    watchTime: Number,
    totalDuration: Number,
    score: Number,
    progress: Number,
    device: String,
    browser: String,
    location: String
  },
  
  // Metadata
  timestamp: { type: Date, default: Date.now },
  sessionId: String,
  ipAddress: String,
  userAgent: String
});

// Indexes for performance
analyticsSchema.index({ type: 1, timestamp: -1 });
analyticsSchema.index({ courseId: 1, timestamp: -1 });
analyticsSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('Analytics', analyticsSchema);