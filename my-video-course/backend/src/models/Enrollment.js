const mongoose = require('mongoose');

const EnrollmentSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // User email or ID
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  progress: {
    type: Map,
    of: {
      completed: { type: Boolean, default: false },
      completedAt: { type: Date }
    },
    default: {}
  },
  status: { type: String, enum: ['active', 'completed'], default: 'active' },
  enrolledAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Enrollment', EnrollmentSchema);
