const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend/.env') });

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({ region: 'us-east-1' });

const BUCKET_NAME = 'video-course-app-video-bucket-prod-6m5k2til';
const TABLE_NAME = process.env.NODE_ENV === 'production' ? 'video-course-app-videos-prod' : 'video-course-app-videos-dev';

async function cleanupPhantomVideos() {
    const courseName = 'DEVOPS BootCamp  By Tech World With NANA';
    console.log(`🧹 Starting Phantom Cleanup for: "${courseName}"`);

    try {
        // 1. Get all videos for this course
        const queryCmd = new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'courseName = :cn',
            ExpressionAttributeValues: { ':cn': courseName }
        });

        const response = await docClient.send(queryCmd);
        const items = response.Items || [];
        console.log(`🔍 Found ${items.length} items to verify.`);

        let deletedCount = 0;
        for (const item of items) {
            const key = item.s3Key || (item.videoUrl && item.videoUrl.split('.amazonaws.com/')[1]?.split('?')[0]);
            
            if (!key) {
                console.warn(`⚠️ Skipped item without S3 context: ${item.title}`);
                continue;
            }

            // 2. Verify existence in S3
            try {
                await s3Client.send(new HeadObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: key.trim()
                }));
                console.log(`✅ Verified S3: ${item.title}`);
            } catch (err) {
                if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
                    console.log(`❌ Missing from S3: ${item.title} (Key: ${key})`);
                    console.log(`   🚀 PRUNING: ${item.videoId} from DynamoDB...`);
                    
                    await docClient.send(new DeleteCommand({
                        TableName: TABLE_NAME,
                        Key: {
                            courseName: courseName,
                            videoId: item.videoId
                        }
                    }));
                    deletedCount++;
                } else {
                    console.error(`⚠️ S3 Head Error for ${item.title}: ${err.message}`);
                }
            }
        }

        console.log(`\n🎉 Cleanup Complete! Pruned ${deletedCount} phantom entries.`);

    } catch (err) {
        console.error('❌ Critical Error during cleanup:', err.message);
    }
}

cleanupPhantomVideos();
