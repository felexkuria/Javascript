const mongoose = require('mongoose');

const lectureSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  type: { type: String, enum: ['video', 'article', 'quiz'], default: 'video' },
  videoUrl: String,
  s3Key: String,
  duration: Number,
  order: { type: Number, default: 0 },
  captionsReady: { type: Boolean, default: false },
  captionsUrl: String,
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' },
  createdAt: { type: Date, default: Date.now }
});

const sectionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  order: { type: Number, default: 0 },
  lectures: [lectureSchema],
  createdAt: { type: Date, default: Date.now }
});

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subtitle: String,
  description: String,
  category: { type: String, required: true },
  level: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },
  language: { type: String, default: 'english' },
  price: { type: Number, default: 0 },
  thumbnail: String,
  promoVideo: String,
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  
  // Course structure
  sections: [sectionSchema],
  
  // Metadata
  createdBy: { type: String, required: true },
  instructors: [String],
  tags: [String],
  
  // Analytics
  enrollments: { type: Number, default: 0 },
  totalDuration: { type: Number, default: 0 },
  totalLectures: { type: Number, default: 0 },
  rating: { type: Number, default: 0 },
  reviews: { type: Number, default: 0 },
  
  // SEO
  slug: String,
  metaTitle: String,
  metaDescription: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update totalLectures and totalDuration before saving
courseSchema.pre('save', function(next) {
  this.totalLectures = this.sections.reduce((total, section) => total + section.lectures.length, 0);
  this.totalDuration = this.sections.reduce((total, section) => 
    total + section.lectures.reduce((sectionTotal, lecture) => sectionTotal + (lecture.duration || 0), 0), 0
  );
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Course', courseSchema);