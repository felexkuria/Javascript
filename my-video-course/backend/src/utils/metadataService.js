const ffmpeg = require('fluent-ffmpeg');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

class MetadataService {
  /**
   * Get duration of a video file in seconds using ffprobe.
   */
  async getVideoDuration(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          console.warn('ffprobe error:', err.message);
          return resolve(0);
        }
        const duration = metadata.format.duration;
        resolve(Math.round(duration) || 0);
      });
    });
  }

  /**
   * Get page count of a PDF file using pdf-lib.
   */
  async getPdfPageCount(filePath) {
    try {
      const existingPdfBytes = fs.readFileSync(filePath);
      const pdfDoc = await PDFDocument.load(existingPdfBytes, { 
        ignoreEncryption: true,
        updateMetadata: false 
      });
      return pdfDoc.getPageCount();
    } catch (err) {
      console.warn('PDF metadata error:', err.message);
      return 0;
    }
  }

  /**
   * Format duration into HH:MM:SS or MM:SS
   */
  formatDuration(seconds) {
    if (!seconds) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    let ret = "";
    if (hrs > 0) {
      ret += "" + hrs + ":" + (mins < 10 ? "0" : "");
    }
    ret += "" + mins + ":" + (secs < 10 ? "0" : "");
    ret += "" + secs;
    return ret;
  }
}

module.exports = new MetadataService();
