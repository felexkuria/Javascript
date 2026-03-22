const mongoose = require('mongoose');

const LectureSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { type: String, enum: ['video', 'quiz', 'resource'], default: 'video' },
  contentId: { type: String, required: true }, // videoId or quizId
  s3Key: { type: String },
  duration: { type: Number }, // in seconds
  isFree: { type: Boolean, default: false }
});

const SectionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  lectures: [LectureSchema]
});

const CourseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String },
  thumbnail: { type: String },
  instructorId: { type: String, required: true }, // User email or ID
  category: { type: String },
  level: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'intermediate' },
  price: { type: Number, default: 0 },
  sections: [SectionSchema],
  totalVideos: { type: Number, default: 0 },
  totalDuration: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Course', CourseSchema);
