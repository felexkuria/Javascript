const fs = require('fs');
const path = require('path');
const videoService = require('./services/videoService');
const thumbnailGenerator = require('./services/thumbnailGenerator');

async function generateThumbnails() {
  const thumbnailsDir = path.join(__dirname, 'public', 'thumbnails');
  const thumbnailFiles = fs.readdirSync(thumbnailsDir).filter(f => f.endsWith('.jpg'));
  
  const localStorage = videoService.getLocalStorage();
  let generated = 0;
  let updated = 0;
  
  for (const courseName of Object.keys(localStorage)) {
    for (const video of localStorage[courseName]) {
      if (!video._id || !video.videoUrl) continue;
      
      const videoId = video._id.toString();
      let matchingThumbnail = thumbnailFiles.find(f => f.startsWith(videoId));
      
      if (!matchingThumbnail) {
        const videoPath = path.join(__dirname, 'public', 'videos', video.videoUrl);
        if (fs.existsSync(videoPath)) {
          try {
            const generatedUrl = await thumbnailGenerator.generateThumbnail(videoPath, videoId);
            if (generatedUrl) {
              matchingThumbnail = path.basename(generatedUrl);
              generated++;
            }
          } catch (error) {
            console.warn(`Failed to generate thumbnail for ${video.title}:`, error.message);
          }
        }
      }
      
      video.thumbnailUrl = matchingThumbnail ? `/thumbnails/${matchingThumbnail}` : null;
      updated++;
    }
  }
  
  videoService.saveLocalStorage(localStorage);
  console.log(`✅ Generated ${generated} new thumbnails, updated ${updated} videos`);
}

generateThumbnails().catch(console.error);