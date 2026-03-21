const fs = require('fs');

// Count videos from localStorage.json
const data = JSON.parse(fs.readFileSync('data/localStorage.json', 'utf8'));
let totalVideos = 0;
let watchedVideos = 0;

console.log('Video count by course:');
Object.keys(data).forEach(course => {
  const videos = data[course] || [];
  const watched = videos.filter(v => v && v.watched === true).length;
  const total = videos.length;
  
  console.log(`${course}:`);
  console.log(`  Total: ${total} videos`);
  console.log(`  Watched: ${watched} videos`);
  console.log(`  Progress: ${Math.round((watched/total)*100)}%`);
  console.log('');
  
  totalVideos += total;
  watchedVideos += watched;
});

console.log(`TOTALS:`);
console.log(`Total videos: ${totalVideos}`);
console.log(`Watched videos: ${watchedVideos}`);
console.log(`Overall progress: ${Math.round((watchedVideos/totalVideos)*100)}%`);