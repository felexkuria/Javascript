/**
 * Generate Thumbnails for All Videos
 * 
 * This script generates thumbnails for all videos in the system
 * Run with: node services/generateAllThumbnails.js
 */

const fs = require('fs');
const path = require('path');
const thumbnailGenerator = require('./thumbnailGenerator');
const videoService = require('./videoService');

async function generateAllThumbnails() {
  try {
    console.log('Generating thumbnails for all videos...');
    
    // Get the video directory
    const videoDir = path.join(__dirname, '..', 'public', 'videos');
    
    // Get all course folders
    const courseFolders = fs.readdirSync(videoDir).filter(folder => {
      return fs.statSync(path.join(videoDir, folder)).isDirectory();
    });
    
    let totalVideos = 0;
    let successCount = 0;
    let failCount = 0;
    
    // Process each course
    for (const courseName of courseFolders) {
      console.log(`Processing course: ${courseName}`);
      
      // Get videos for the course
      const videos = await videoService.getVideosForCourse(courseName);
      
      if (!videos || videos.length === 0) {
        console.log(`No videos found for course: ${courseName}`);
        continue;
      }
      
      totalVideos += videos.length;
      
      // Generate thumbnails for each video
      for (const video of videos) {
        if (!video.videoUrl) {
          console.log(`Skipping video without URL: ${video.title}`);
          failCount++;
          continue;
        }
        
        const videoPath = path.join(videoDir, video.videoUrl);
        
        if (!fs.existsSync(videoPath)) {
          console.log(`Video file not found: ${videoPath}`);
          failCount++;
          continue;
        }
        
        try {
          console.log(`Generating thumbnail for: ${video.title}`);
          const thumbnailUrl = await thumbnailGenerator.generateThumbnail(videoPath, video._id);
          
          if (thumbnailUrl) {
            console.log(`Thumbnail generated: ${thumbnailUrl}`);
            successCount++;
          } else {
            console.log(`Failed to generate thumbnail for: ${video.title}`);
            failCount++;
          }
        } catch (err) {
          console.error(`Error generating thumbnail for ${video.title}:`, err);
          failCount++;
        }
      }
    }
    
    console.log('\nThumbnail Generation Summary:');
    console.log(`Total videos: ${totalVideos}`);
    console.log(`Successfully generated: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    
  } catch (err) {
    console.error('Error generating thumbnails:', err);
  }
}

generateAllThumbnails();