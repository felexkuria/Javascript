#!/usr/bin/env node
// Sync S3 videos to DynamoDB
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const path = require('path');

const s3Client = new S3Client({ region: 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);

const BUCKET_NAME = 'video-course-bucket-047ad47c';
const TABLE_NAME = process.env.NODE_ENV === 'production' ? 'video-course-app-videos-prod' : 'video-course-app-videos-dev';

async function syncS3ToDynamoDB() {
    try {
        console.log('🔄 Starting S3 to DynamoDB sync...');
        console.log(`📊 Table: ${TABLE_NAME}`);
        
        // List all objects in S3 videos folder
        const s3Objects = await listAllS3Objects('videos/');
        console.log(`📁 Found ${s3Objects.length} objects in S3`);
        
        // Filter video files
        const videoFiles = s3Objects.filter(obj => {
            const ext = path.extname(obj.Key).toLowerCase();
            return ['.mp4', '.mkv', '.avi', '.mov', '.wmv'].includes(ext);
        });
        
        console.log(`🎬 Found ${videoFiles.length} video files`);
        
        // Group by course
        const courseVideos = {};
        videoFiles.forEach(video => {
            const pathParts = video.Key.split('/');
            if (pathParts.length >= 3) {
                const courseName = pathParts[1]; // videos/COURSE_NAME/...
                if (!courseVideos[courseName]) {
                    courseVideos[courseName] = [];
                }
                courseVideos[courseName].push(video);
            }
        });
        
        console.log(`📚 Found ${Object.keys(courseVideos).length} courses`);
        
        // Sync each course
        let totalSynced = 0;
        for (const [courseName, videos] of Object.entries(courseVideos)) {
            console.log(`\n📖 Syncing course: ${courseName} (${videos.length} videos)`);
            
            for (const video of videos) {
                const synced = await syncVideoToDynamoDB(courseName, video);
                if (synced) totalSynced++;
            }
        }
        
        console.log(`\n✅ Sync completed! ${totalSynced} videos synced to DynamoDB`);
        
    } catch (error) {
        console.error('❌ Sync failed:', error);
        process.exit(1);
    }
}

async function listAllS3Objects(prefix) {
    const objects = [];
    let continuationToken = null;
    
    do {
        const params = {
            Bucket: BUCKET_NAME,
            Prefix: prefix,
            MaxKeys: 1000,
            ContinuationToken: continuationToken
        };
        
        const command = new ListObjectsV2Command(params);
        const result = await s3Client.send(command);
        objects.push(...(result.Contents || []));
        continuationToken = result.NextContinuationToken;
        
    } while (continuationToken);
    
    return objects;
}

async function syncVideoToDynamoDB(courseName, s3Object) {
    try {
        const fileName = path.basename(s3Object.Key);
        const videoId = generateVideoId(s3Object.Key);
        
        // Check if video already exists
        const existing = await getExistingVideo(courseName, videoId);
        if (existing) {
            console.log(`⏭️  Skipping existing: ${fileName}`);
            return false;
        }
        
        // Extract video metadata
        const videoData = {
            courseName: courseName,
            videoId: videoId,
            _id: videoId,
            title: extractTitle(fileName),
            videoUrl: s3Object.Key,
            s3Key: s3Object.Key,
            fileSize: s3Object.Size,
            lastModified: s3Object.LastModified.toISOString(),
            watched: false,
            duration: null,
            thumbnail: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        // Add to DynamoDB
        const putCommand = new PutCommand({
            TableName: TABLE_NAME,
            Item: videoData
        });
        await dynamodb.send(putCommand);
        
        console.log(`✅ Added: ${fileName}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Failed to sync ${s3Object.Key}:`, error.message);
        return false;
    }
}

async function getExistingVideo(courseName, videoId) {
    try {
        const getCommand = new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                courseName: courseName,
                videoId: videoId
            }
        });
        const result = await dynamodb.send(getCommand);
        
        return result.Item;
    } catch (error) {
        return null;
    }
}

function generateVideoId(s3Key) {
    // Generate consistent ID from S3 key
    const crypto = require('crypto');
    return crypto.createHash('md5').update(s3Key).digest('hex').substring(0, 24);
}

function extractTitle(fileName) {
    // Remove extension and clean up filename
    const nameWithoutExt = path.parse(fileName).name;
    
    // Replace common separators with spaces
    let title = nameWithoutExt
        .replace(/[-_\.]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    // Capitalize first letter of each word
    title = title.replace(/\w\S*/g, (txt) => 
        txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
    
    return title;
}

// Run if called directly
if (require.main === module) {
    syncS3ToDynamoDB();
}

module.exports = { syncS3ToDynamoDB };