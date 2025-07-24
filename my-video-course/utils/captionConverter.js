/**
 * Utility to convert SRT captions to WebVTT format
 */

/**
 * Convert SRT format to WebVTT format
 * @param {string} srtContent - The SRT content to convert
 * @returns {string} - WebVTT formatted content
 */
function srtToVtt(srtContent) {
  if (!srtContent) return '';
  
  // Add WebVTT header
  let vttContent = 'WEBVTT\n\n';
  
  // Split by double newline to get caption blocks
  const blocks = srtContent.trim().split(/\n\s*\n/);
  
  blocks.forEach(block => {
    // Split each block into lines
    const lines = block.trim().split('\n');
    
    // Skip the index number (first line)
    if (lines.length >= 3) {
      // Get the timestamp line
      const timeLine = lines[1];
      
      // Convert SRT timestamp format (00:00:00,000 --> 00:00:00,000) to WebVTT format (00:00:00.000 --> 00:00:00.000)
      const vttTimeLine = timeLine.replace(/,/g, '.');
      
      // Get the text content (can be multiple lines)
      const textContent = lines.slice(2).join('\n');
      
      // Add to VTT content
      vttContent += `${vttTimeLine}\n${textContent}\n\n`;
    }
  });
  
  return vttContent;
}

module.exports = {
  srtToVtt
};