/**
 * Reset Watch Status Utility
 * 
 * This script resets the watched status of all videos in localStorage.json
 * Run with: node services/resetWatchStatus.js
 */

const fs = require('fs');
const path = require('path');

// Path to localStorage.json
const localStoragePath = path.join(__dirname, '..', 'data', 'localStorage.json');

console.log('Resetting watch status in localStorage.json...');

try {
  // Read the file
  const data = fs.readFileSync(localStoragePath, 'utf8');
  const localStorage = JSON.parse(data);
  
  // Count before
  let totalVideos = 0;
  let watchedBefore = 0;
  
  // Process each course
  for (const courseName in localStorage) {
    const videos = localStorage[courseName];
    totalVideos += videos.length;
    
    // Count watched videos before reset
    watchedBefore += videos.filter(v => v.watched).length;
    
    // Reset watched status
    videos.forEach(video => {
      video.watched = false;
      video.watchedAt = null;
    });
    
    // Sort videos by lesson number
    videos.sort((a, b) => {
      const aNum = parseInt(a.title.match(/\\d+/)) || 0;
      const bNum = parseInt(b.title.match(/\\d+/)) || 0;
      return aNum - bNum;
    });
  }
  
  // Write the updated data back to the file
  fs.writeFileSync(localStoragePath, JSON.stringify(localStorage, null, 2), 'utf8');
  
  console.log(`Reset complete!`);
  console.log(`Total videos: ${totalVideos}`);
  console.log(`Videos marked as watched before: ${watchedBefore}`);
  console.log(`Videos marked as watched after: 0`);
  
} catch (err) {
  console.error('Error resetting watch status:', err);
}