const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: [{ type: String, required: true }],
  correctAnswer: { type: Number, required: true }, // Index of correct option
  explanation: String,
  points: { type: Number, default: 1 },
  order: { type: Number, default: 0 }
});

const quizSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  lectureId: String,
  
  questions: [questionSchema],
  
  // Settings
  timeLimit: Number, // in minutes
  passingScore: { type: Number, default: 70 }, // percentage
  maxAttempts: { type: Number, default: 3 },
  shuffleQuestions: { type: Boolean, default: false },
  shuffleOptions: { type: Boolean, default: false },
  
  // Generation info
  generatedFrom: { type: String, enum: ['manual', 'captions', 'ai'], default: 'manual' },
  sourceTranscript: String,
  
  // Status
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

quizSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Quiz', quizSchema);