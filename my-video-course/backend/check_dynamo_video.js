const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend/.env') });

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function checkVideo() {
    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
    const TableName = `video-course-app-videos-${environment}`;
    const courseName = 'DEVOPS BootCamp  By Tech World With NANA';

    console.log(`🔍 Checking DynamoDB for course: "${courseName}" in table ${TableName}`);

    try {
        const command = new QueryCommand({
            TableName,
            KeyConditionExpression: 'courseName = :cn',
            ExpressionAttributeValues: {
                ':cn': courseName
            }
        });

        const response = await docClient.send(command);
        console.log(`✅ Found ${response.Items ? response.Items.length : 0} items.`);

        if (response.Items && response.Items.length > 0) {
            response.Items.forEach(item => {
                console.log(`\n📺 Video: ${item.title}`);
                console.log(`   ID:     ${item.videoId}`);
                console.log(`   URL:    ${item.videoUrl}`);
                console.log(`   S3Key:  ${item.s3Key}`);
            });
        }
    } catch (err) {
        console.error('❌ Error querying DynamoDB:', err.message);
    }
}

checkVideo();
