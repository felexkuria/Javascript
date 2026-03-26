const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs');

async function createPdf() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 400]);
  page.drawText('Multitouch Academy - Metadata Test Page 1', { x: 50, y: 350, size: 20, color: rgb(0, 0, 0) });
  
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('metadata_sample.pdf', pdfBytes);
  console.log('✅ Created metadata_sample.pdf');
}

createPdf();
