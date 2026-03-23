const mongoose = require('mongoose');

const CertificateSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  courseName: { type: String, required: true },
  certificateId: { type: String, required: true, unique: true }, // UUID
  issuedDate: { type: Date, default: Date.now },
  s3Url: { type: String, required: true },
  ipfsHash: { type: String },
  verifiedBadge: { type: Boolean, default: true }
});

module.exports = mongoose.model('Certificate', CertificateSchema);
