const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend/.env') });

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.NODE_ENV === 'production' ? 'video-course-app-videos-prod' : 'video-course-app-videos-dev';

async function strictCleanup() {
    const courseName = 'DEVOPS BootCamp  By Tech World With NANA';
    console.log(`🧹 Starting Strict Invalid Cleanup for: "${courseName}"`);

    try {
        const queryCmd = new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'courseName = :cn',
            ExpressionAttributeValues: { ':cn': courseName }
        });

        const response = await docClient.send(queryCmd);
        const items = response.Items || [];
        let deletedCount = 0;

        for (const item of items) {
            const hasNoUrl = !item.videoUrl || item.videoUrl === 'undefined' || item.videoUrl === 'null';
            const hasNoS3Key = !item.s3Key || item.s3Key === 'undefined' || item.s3Key === 'null';

            if (hasNoUrl || hasNoS3Key) {
                console.log(`🚀 PRUNING INVALID ENTRY: ${item.title} (ID: ${item.videoId})`);
                await docClient.send(new DeleteCommand({
                    TableName: TABLE_NAME,
                    Key: {
                        courseName: courseName,
                        videoId: item.videoId
                    }
                }));
                deletedCount++;
            }
        }

        console.log(`\n🎉 Strict Cleanup Complete! Pruned ${deletedCount} invalid entries.`);

    } catch (err) {
        console.error('❌ Error during strict cleanup:', err.message);
    }
}

strictCleanup();
