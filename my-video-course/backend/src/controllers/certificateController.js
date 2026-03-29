const PDFDocument = require('pdfkit');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const dynamodb = require('../utils/dynamodb');
const dynamoVideoService = require('../services/dynamoVideoService');
const { v4: uuidv4 } = require('uuid');
const s3Utils = require('../utils/s3Utils');

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

    const certId = uuidv4();
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
      // Background & Base Geometry
      doc.rect(0, 0, doc.page.width, doc.page.height).fill('#001E2B');
      
      // Abstract Geometric Patterns (Aesthetic Pulse)
      doc.save();
      doc.opacity(0.1);
      for (let i = 0; i < 5; i++) {
        doc.moveTo(Math.random() * 800, 0)
           .lineTo(Math.random() * 800, 600)
           .stroke('#00ED64');
      }
      doc.restore();

      // Border Accents
      doc.rect(40, 40, doc.page.width - 80, doc.page.height - 80).stroke('#00ED64');
      doc.rect(50, 50, doc.page.width - 100, doc.page.height - 100).opacity(0.3).stroke('#00ED64');

      // Header Branding
      doc.fillColor('#00ED64')
        .font('Helvetica-Bold')
        .fontSize(32)
        .text('MULTITOUCH ACADEMY', 0, 100, { align: 'center', characterSpacing: 2 });

      doc.fillColor('#E7EEEB')
        .fontSize(14)
        .font('Helvetica')
        .text('OFFICIAL CLOUD ENGINEERING CERTIFICATION', 0, 140, { align: 'center', characterSpacing: 4 });

      // Main Content
      doc.fillColor('#FFFFFF')
        .fontSize(18)
        .text('This credential verifies that', 0, 220, { align: 'center' });

      doc.fillColor('#00ED64')
        .fontSize(44)
        .font('Helvetica-Bold')
        .text(req.user.name || 'Architect Student', 0, 255, { align: 'center' });

      doc.fillColor('#FFFFFF')
        .fontSize(16)
        .font('Helvetica')
        .text('has successfully completed the professional track', 0, 320, { align: 'center' });

      doc.fillColor('#E7EEEB')
        .fontSize(28)
        .font('Helvetica-Bold')
        .text(course.title || course.name, 0, 355, { align: 'center' });

      // Footer Metrics
      const footerY = 480;
      doc.fillColor('#9FB1AD')
        .fontSize(10)
        .font('Helvetica')
        .text(`ISSUED: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, 100, footerY);
      
      doc.text(`CERTIFICATE ID: ${certId.toUpperCase()}`, 0, footerY, { align: 'center' });
      
      doc.fillColor('#00ED64')
        .font('Helvetica-Bold')
        .text('VERIFIED ARCHITECT SIGNATURE', 550, footerY);
      
      doc.rect(550, footerY - 5, 200, 1).fill('#00ED64'); // Signature line

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
