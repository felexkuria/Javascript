const PDFDocument = require('pdfkit');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const dynamodb = require('../utils/dynamodb');
const dynamoVideoService = require('../services/dynamoVideoService');
const { v4: uuidv4 } = require('uuid');
const s3Utils = require('../utils/s3Utils');
const fs = require('fs');
const path = require('path');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

exports.generateCertificate = async (req, res) => {
  try {
    // 1. Verify 100% Progress (Hardened Enforcement)
    const userId = req.user.email || req.user.id;
    const { courseId } = req.body;
    
    const courses = await dynamoVideoService.getAllCourses(userId);
    const course = courses.find(c => c.name === courseId || c.title === courseId);
    
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const watchedCount = course.videos.filter(v => v.watched).length;
    const totalCount = course.videos.length;
    
    if (watchedCount < totalCount && totalCount > 0) {
      return res.status(403).json({ 
        success: false, 
        message: `Architectural Incomplete: ${watchedCount}/${totalCount} vectors verified. 100% completion required.` 
      });
    }

    // Check if certificate already exists
    const certs = await dynamodb.getCertificates(userId);
    const existing = certs.find(c => c.courseName === (course.title || course.name));
    if (existing) {
      return res.json({ success: true, certificate: existing });
    }

    const certId = `MTA-2026-${courseName.substring(0, 3).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const safeCourseId = s3Utils.sanitizeKey(courseId);
    const fileName = `certificates/${userId}_${safeCourseId}_${certId}.pdf`;

    // 2. Generate Premium PDF
    const doc = new PDFDocument({ layout: 'landscape', size: 'A4', margin: 0 });
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    
    return new Promise((resolve, reject) => {
      doc.on('end', async () => {
        const pdfData = Buffer.concat(buffers);
        
        try {
          const uploadCmd = new PutObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: fileName,
            Body: pdfData,
            ContentType: 'application/pdf'
          });
          
          await s3Client.send(uploadCmd);
          const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${fileName}`;

          const certificate = {
            userId,
            courseId: courseId,
            courseName: course.title || course.name,
            certificateId: certId,
            s3Url,
            issuedAt: new Date().toISOString()
          };

          await dynamodb.saveCertificate(certificate);
          res.json({ success: true, certificate });
          resolve();
        } catch (s3Err) {
          console.error('S3 Upload Error:', s3Err);
          res.status(500).json({ success: false, message: 'Failed to upload certificate' });
          resolve();
        }
      });

      // --- HIGH-FIDELITY ATLAS DESIGN ---
      // 1. Background Logic
      doc.rect(0, 0, doc.page.width, doc.page.height).fill('#001E2B');
      
      // Technical Geometric Accents (Geometric Pulse)
      doc.save();
      doc.lineWidth(1).strokeColor('#00ED64').opacity(0.15);
      
      // Vertical Circuit Lines
      for (let i = 0; i < doc.page.width; i += 60) {
        doc.moveTo(i, 0).lineTo(i, doc.page.height).stroke();
      }
      
      // Angular Accents
      doc.lineWidth(2).opacity(0.3);
      doc.moveTo(0, 0).lineTo(150, 150).stroke();
      doc.moveTo(doc.page.width, doc.page.height).lineTo(doc.page.width - 150, doc.page.height - 150).stroke();
      doc.restore();

      // Border Architecture
      doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).lineWidth(3).strokeColor('#00ED64');
      doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60).lineWidth(1).opacity(0.2).stroke('#FFFFFF');

      // 2. Branding (Logo Integration)
      try {
        const logoPath = path.join(__dirname, '../../../frontend/public/images/logo-multitouch.png');
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, (doc.page.width / 2) - 30, 60, { width: 60 });
        }
      } catch (e) {
        console.warn('Logo embed failed:', e.message);
      }

      doc.fillColor('#00ED64')
        .font('Helvetica-Bold')
        .fontSize(24)
        .text('MULTITOUCH ACADEMY', 0, 130, { align: 'center', characterSpacing: 3 });

      doc.fillColor('#9FB1AD')
        .fontSize(12)
        .font('Helvetica')
        .text('OFFICIAL ENGINEERING CREDENTIAL', 0, 160, { align: 'center', characterSpacing: 5 });

      // 3. Identification Tier
      doc.fillColor('#FFFFFF')
        .fontSize(18)
        .font('Helvetica')
        .text('This verifies that', 0, 220, { align: 'center' });

      doc.fillColor('#00ED64')
        .fontSize(48)
        .font('Helvetica-Bold')
        .text(req.user?.name || 'Architect Student', 0, 250, { align: 'center' });

      doc.fillColor('#FFFFFF')
        .fontSize(16)
        .font('Helvetica')
        .text('successfully mastered the curriculum', 0, 310, { align: 'center' });

      doc.fillColor('#FFFFFF')
        .fontSize(30)
        .font('Helvetica-Bold')
        .text(course.title || course.name, 0, 345, { align: 'center', characterSpacing: 1 });

      // 4. Verification Metrics
      const footerY = 480;
      doc.fillColor('#516462')
        .fontSize(9)
        .font('Helvetica')
        .text(`ISSUED ON: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}`, 70, footerY);
      
      doc.text(`CERTIFICATE ID: ${certId.toUpperCase()}`, 0, footerY, { align: 'center' });
      
      doc.fillColor('#00ED64')
        .font('Helvetica-Bold')
        .text('VERIFIED BY MULTITOUCH CI/CD', doc.page.width - 250, footerY);
      
      doc.rect(doc.page.width - 250, footerY - 5, 180, 0.5).fill('#00ED64');

      doc.end();
    });

  } catch (error) {
    console.error('Certificate Generation Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

exports.getUserCertificates = async (req, res) => {
  try {
    const userId = req.user.email || req.user.id;
    const certificates = await dynamodb.getCertificates(userId);
    res.json({ success: true, certificates });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch certificates' });
  }
};
