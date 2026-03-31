const ds = require('../src/utils/dynamodb');
const { UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { execSync } = require('child_process');
const fs = require('fs');

const BUCKET = "video-course-app-video-bucket-prod-6m5k2til";
const s3 = new S3Client({ region: 'us-east-1' });

async function fix() {
    console.log("🛠️ Targeted Repair: AWS AI-ML Thumbnail (DEV)...");
    
    const TABLE = "video-course-app-videos-dev";
    const PK = { courseName: "AWS AI-ML -dev", videoId: "1774910421568" };
    
    const result = await ds.docClient.send(new GetCommand({ TableName: TABLE, Key: PK }));
    const video = result.Item;
    
    if (!video) {
        console.error("❌ Video not found in DEV table.");
        return;
    }
    
    const s3Key = video.s3Key || "videos/aws_ai-ml_-dev/1774910473251-lesson1.mp4";
    const thumbKey = `thumbnails/aws_ai-ml_-dev/1774910421568.jpg`;
    const tempVideo = `/tmp/aws_fix.mp4`;
    const tempThumb = `/tmp/aws_fix.jpg`;
    
    console.log(`🎨 Generating thumbnail for ${video.title} from ${s3Key}...`);
    
    try {
        execSync(`aws s3api get-object --bucket ${BUCKET} --key "${s3Key}" --range bytes=0-5000000 "${tempVideo}"`, { stdio: 'ignore' });
        execSync(`ffmpeg -i "${tempVideo}" -ss 00:00:01 -vframes 1 "${tempThumb}" -y`, { stdio: 'ignore' });
        
        await s3.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: thumbKey,
            Body: fs.createReadStream(tempThumb),
            ContentType: 'image/jpeg'
        }));
        
        const thumbUrl = `https://${BUCKET}.s3.us-east-1.amazonaws.com/${thumbKey}`;
        
        await ds.docClient.send(new UpdateCommand({
            TableName: TABLE,
            Key: PK,
            UpdateExpression: "SET thumbnailUrl = :u, #st = :st, updatedAt = :now",
            ExpressionAttributeNames: { "#st": "status" },
            ExpressionAttributeValues: {
                ":u": thumbUrl,
                ":st": "ONLINE",
                ":now": new Date().toISOString()
            }
        }));
        
        console.log(`✅ Thumbnail RESTORED: ${thumbUrl}`);
    } catch (err) {
        console.error(`❌ Repair failed: ${err.message}`);
    } finally {
        if (fs.existsSync(tempVideo)) fs.unlinkSync(tempVideo);
        if (fs.existsSync(tempThumb)) fs.unlinkSync(tempThumb);
    }
}

fix().catch(console.error);
