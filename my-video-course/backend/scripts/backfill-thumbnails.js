const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const dynamodb = require('../src/utils/dynamodb'); // Use existing DB utility from backend

// Configurations
const BUCKET = "video-course-app-video-bucket-prod-6m5k2til";
const VIDEO_TABLE = "video-course-app-videos-prod";
const REGION = "us-east-1";

const s3 = new S3Client({ region: REGION });

async function backfill() {
  console.log("🚀 Starting SOTA Thumbnail Backfill (Backend Execution)...");
  
  const { ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
  const videosResult = await dynamodb.docClient.send(new ScanCommand({
    TableName: VIDEO_TABLE
  }));
  
  const videos = videosResult.Items || [];
  console.log(`🔍 Found ${videos.length} total video records.`);
  
  let processed = 0;
  let skipped = 0;
  
  for (const video of videos) {
    // Determine the S3 key from either field
    const s3Key = video.s3Key || (video.videoUrl ? video.videoUrl.split('.com/')[1] : null);
    if (!s3Key) {
        console.warn(`⚠️  No S3 Key for video: ${video.title}`);
        continue;
    }

    const videoFilename = path.basename(s3Key);
    const thumbFilename = videoFilename.replace(/\.[^/.]+$/, "") + ".jpg";
    const courseFolder = s3Key.split('/')[1] || "unknown";
    const thumbKey = `thumbnails/${courseFolder}/${thumbFilename}`;
    const thumbUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${thumbKey}`;

    // Skip if already exists
    if (video.thumbnailUrl === thumbUrl) {
      skipped++;
      continue;
    }
    
    console.log(`🎨 Processing: ${video.title} (${courseFolder})`);
    
    let videoSourcePath = `/tmp/thumb_temp_${Date.now()}.mp4`;
    const tempThumb = `/tmp/thumb_temp_${Date.now()}.jpg`;
    let isLocal = false;

    try {
      // Phase A: Smart Discovery (S3 Primary -> Local Secondary)
      try {
        console.log(`   - Attempting S3 Range Download (0-5MB)...`);
        execSync(`aws s3api get-object --bucket ${BUCKET} --key "${s3Key}" --range bytes=0-5000000 "${videoSourcePath}"`, { stdio: 'ignore' });
      } catch (s3Err) {
        console.warn(`   ⚠️  S3 Download Failed. Falling back to Local Discovery...`);
        const localBasePath = path.join(__dirname, '../../frontend/public/videos');
        if (fs.existsSync(localBasePath)) {
            const localFolders = fs.readdirSync(localBasePath).filter(f => fs.lstatSync(path.join(localBasePath, f)).isDirectory());
            const bestFolder = localFolders.find(f => {
                const folderNormal = f.toLowerCase().replace(/[^a-z0-9]/g, '');
                const courseNormal = courseFolder.toLowerCase().replace(/[^a-z0-9]/g, '');
                return folderNormal.includes(courseNormal.substring(0, 5)) || courseNormal.includes(folderNormal.substring(0, 5));
            });
            
            if (bestFolder) {
                const folderPath = path.join(localBasePath, bestFolder);
                const titleTokens = video.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(t => t.length > 3);
                
                // NEW (Universal SOTA): Recursive Physical Matcher
                const findRecursive = (dir) => {
                    const items = fs.readdirSync(dir);
                    for (const item of items) {
                        const full = path.join(dir, item);
                        if (fs.lstatSync(full).isDirectory()) {
                            const res = findRecursive(full);
                            if (res) return res;
                        } else if (item.toLowerCase().endsWith('.mp4')) {
                            const itemLower = item.toLowerCase();
                            if (titleTokens.length > 0 && titleTokens.every(tok => itemLower.includes(tok))) return full;
                        }
                    }
                    return null;
                };

                const matchedFile = findRecursive(folderPath);
                if (matchedFile) {
                    videoSourcePath = matchedFile;
                    isLocal = true;
                    console.log(`   ✅ LOCAL MATCH (RECURSIVE): ${path.basename(matchedFile)}`);
                }
            }
        }
      }

      if (!isLocal && !fs.existsSync(videoSourcePath)) {
        console.warn(`   ⚠️  Physical Missing: Generating Branded Placeholder...`);
        // NEW (Universal SOTA): Branded Placeholder Generation
        const placeholderImg = `/tmp/placeholder_${Date.now()}.jpg`;
        const color = "#1a1a2e"; // Dark slate
        const accent = "#4ecca3"; // Teal accent
        const titleText = video.title.replace(/'/g, "");
        
        // Command: Create a 1280x720 dark image with the video title and "OFFLINE" status
        const ffmpegPlaceholder = `ffmpeg -f lavfi -i color=c=black:s=1280x720:d=1 -vf "drawtext=text='${titleText}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2-40,drawtext=text='📡 SIGNAL OFFLINE':fontcolor=${accent}:fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2+60" -vframes 1 "${tempThumb}" -y`;
        execSync(ffmpegPlaceholder, { stdio: 'ignore' });
        videoSourcePath = null; // Mark as done via placeholder
      } else {
        // Phase B: FFmpeg Frame Extraction
        console.log(`   - Extracting frame at 00:00:01...`);
        execSync(`ffmpeg -i "${videoSourcePath}" -ss 00:00:01 -vframes 1 -q:v 2 "${tempThumb}" -y`, { stdio: 'ignore' });
      }
      
      // Phase C: S3 Upload
      console.log(`   - Uploading to S3: ${thumbKey}`);
      const fileStream = fs.createReadStream(tempThumb);
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: thumbKey,
        Body: fileStream,
        ContentType: 'image/jpeg'
      }));
      
      // Phase D: DynamoDB Manifest Update
      console.log(`   - Updating Manifest...`);
      // Update the flat video record
      await dynamodb.docClient.send(new UpdateCommand({
        TableName: VIDEO_TABLE,
        Key: { 
            courseName: video.courseName, 
            videoId: video.videoId 
        },
        UpdateExpression: "SET thumbnailUrl = :url, updatedAt = :now, #st = :st",
        ExpressionAttributeNames: {
          "#st": "status"
        },
        ExpressionAttributeValues: {
          ":url": thumbUrl,
          ":now": new Date().toISOString(),
          ":st": videoSourcePath ? "ONLINE" : "OFFLINE"
        }
      }));

      // Bonus: Update the Course Curriculum to ensure the Dashboard is synced
      // (This requires finding the course object, but update record is faster)

      processed++;
      console.log(`   ✅ Success (${videoSourcePath ? "Frame" : "Placeholder"}).`);
    } catch (err) {
      console.error(`   ❌ Failed: ${err.message}`);
    } finally {
      if (!isLocal && fs.existsSync(videoSourcePath)) {
        try { fs.unlinkSync(videoSourcePath); } catch(e) {}
      }
      if (fs.existsSync(tempThumb)) {
        try { fs.unlinkSync(tempThumb); } catch(e) {}
      }
    }
    
    // Optional: Limit for testing
    if (process.argv.includes('--limit') && processed >= parseInt(process.argv[process.argv.indexOf('--limit') + 1])) {
        console.log("🛑 Limit reached.");
        break;
    }
  }
  
  console.log(`\n🎉 Migration Complete! Processed: ${processed} | Skipped: ${skipped}`);
}

backfill().catch(console.error);
