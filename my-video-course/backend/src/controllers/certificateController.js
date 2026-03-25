const PDFDocument = require('pdfkit');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const dynamodb = require('../utils/dynamodb');
const dynamoVideoService = require('../services/dynamoVideoService');
const { v4: uuidv4 } = require('uuid');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

exports.generateCertificate = async (req, res) => {
  try {
    const { courseId } = req.body; // courseId is likely courseName now
    const userId = req.user.email || req.user.id;

    // 1. Verify 100% Progress
    const user = await dynamodb.getUser(userId);
    const course = await dynamoVideoService.getCourseByTitle(courseId, userId);
    
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    // Check if certificate already exists in DynamoDB
    const certs = await dynamodb.getCertificates(userId);
    const existing = certs.find(c => c.courseName === (course.title || course.name));
    if (existing) {
      return res.json({ success: true, certificate: existing });
    }

    const certId = uuidv4();
    const fileName = `certificates/${userId}_${courseId}_${certId}.pdf`;

    // 2. Generate PDF
    const doc = new PDFDocument({ layout: 'landscape', size: 'A4' });
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    
    return new Promise((resolve, reject) => {
      doc.on('end', async () => {
        const pdfData = Buffer.concat(buffers);
        
        // 3. Upload to S3
        try {
          const uploadCmd = new PutObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: fileName,
            Body: pdfData,
            ContentType: 'application/pdf',
            ACL: 'public-read' // Assumes public bucket for certificates or signed URLs
          });
          
          await s3Client.send(uploadCmd);
          const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${fileName}`;

          // 4. Save to DynamoDB
          const certificate = {
            userId,
            courseId: courseId,
            courseName: course.title || course.name,
            certificateId: certId,
            s3Url
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

      // PDF Content Design
      doc.rect(0, 0, doc.page.width, doc.page.height).fill('#001E2B');
      doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).stroke('#00ED64');

      doc.fillColor('#00ED64')
        .fontSize(40)
        .text('Multitouch Academy', 0, 80, { align: 'center' });

      doc.fillColor('#FFFFFF')
        .fontSize(20)
        .text('CERTIFICATE OF COMPLETION', 0, 150, { align: 'center' });

      doc.fontSize(16)
        .text('This is to certify that', 0, 220, { align: 'center' });

      doc.fillColor('#00ED64')
        .fontSize(32)
        .text(user.name, 0, 260, { align: 'center' });

      doc.fillColor('#FFFFFF')
        .fontSize(16)
        .text('has successfully completed the course', 0, 320, { align: 'center' });

      doc.fontSize(24)
        .text(course.title || course.name, 0, 360, { align: 'center' });

      doc.fontSize(12)
        .text(`Issued on: ${new Date().toLocaleDateString()}`, 0, 450, { align: 'center' });
      
      doc.fontSize(10)
        .text(`Certificate ID: ${certId}`, 0, 480, { align: 'center' });

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
