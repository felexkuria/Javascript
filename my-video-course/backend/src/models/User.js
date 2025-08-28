const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  cognitoId: {
    type: String,
    required: false
  },
  roles: {
    type: [String],
    enum: ['student', 'teacher', 'admin'],
    default: ['student']
  },
  gamification: {
    achievements: [String],
    streakData: {
      currentStreak: { type: Number, default: 0 },
      longestStreak: { type: Number, default: 0 },
      lastActiveDate: String,
      streakDates: [String]
    },
    userStats: {
      totalPoints: { type: Number, default: 0 },
      videosWatched: { type: Map, of: Boolean },
      coursesCompleted: { type: Number, default: 0 },
      keyboardShortcutsUsed: { type: Number, default: 0 },
      currentLevel: { type: Number, default: 1 },
      experiencePoints: { type: Number, default: 0 }
    }
  },
  todoProgress: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('User', userSchema);