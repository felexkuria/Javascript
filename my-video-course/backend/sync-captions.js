const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const dynamoVideoService = require('./src/services/dynamoVideoService');

const s3Client = new S3Client({ region: process.env.AWS_REGION });

async function syncCaptionUrls() {
  console.log('🔄 Syncing caption URLs from S3 to DynamoDB...');
  
  try {
    // Get all videos from DynamoDB
    const courses = await dynamoVideoService.getAllCourses();
    let totalUpdated = 0;
    
    for (const course of courses) {
      console.log(`\n📚 Processing course: ${course.name}`);
      
      for (const video of course.videos) {
        if (!video.s3Key) continue;
        
        // Extract video filename for caption matching
        let videoFilename = video.s3Key.split('/').pop().replace('.mp4', '');
        
        // Handle different filename patterns
        if (videoFilename.includes('_')) {
          // For files like "1756426922323_lesson_2" -> "lesson2"
          const parts = videoFilename.split('_');
          if (parts.length >= 3 && parts[1] === 'lesson') {
            videoFilename = `lesson${parts[2]}`;
          }
        }
        
        console.log(`🔍 Checking captions for ${video.title} (filename: ${videoFilename})`);
        
        // Check for caption files with timestamp patterns
        const timestamps = ['1756578844', '1756579046', '1756575209', '1756585495'];
        let captionFound = false;
        
        for (const timestamp of timestamps) {
          const captionKeys = [
            `videos/${course.name}/${videoFilename}__${timestamp}.vtt`,
            `videos/${course.name}/${videoFilename}__${timestamp}.srt`
          ];
          
          for (const captionKey of captionKeys) {
            try {
              // Check if caption exists in S3
              const listParams = {
                Bucket: process.env.S3_BUCKET_NAME,
                Prefix: captionKey,
                MaxKeys: 1
              };
              
              const result = await s3Client.send(new ListObjectsV2Command(listParams));
              
              if (result.Contents && result.Contents.length > 0) {
                // Update video with caption URL
                const captionUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${captionKey}`;
                
                await dynamoVideoService.updateVideo(course.name, video._id, {
                  captionsUrl: captionUrl,
                  s3CaptionKey: captionKey
                });
                
                console.log(`✅ Updated ${video.title} with caption: ${captionUrl}`);
                totalUpdated++;
                captionFound = true;
                break;
              }
            } catch (error) {
              // Caption doesn't exist, continue
            }
          }
          
          if (captionFound) break;
        }
        
        if (!captionFound) {
          console.log(`❌ No captions found for ${video.title} (searched: ${videoFilename})`);
        }
      }
    }
    
    console.log(`\n🎯 Sync complete! Updated ${totalUpdated} videos with caption URLs`);
    
  } catch (error) {
    console.error('❌ Sync failed:', error);
  }
}

syncCaptionUrls();