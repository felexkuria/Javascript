function srtToVtt(srtContent) {
  // Convert SRT format to WebVTT format
  let vttContent = 'WEBVTT\n\n';
  
  // Replace SRT timestamps with VTT format
  vttContent += srtContent
    .replace(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/g, '$1:$2:$3.$4')
    .replace(/^\d+$/gm, '') // Remove sequence numbers
    .replace(/\n\n\n/g, '\n\n') // Clean up extra newlines
    .trim();
  
  return vttContent;
}

module.exports = {
  srtToVtt
};