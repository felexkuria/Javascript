const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
require('dotenv').config();

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});
const docClient = DynamoDBDocumentClient.from(client);

async function inspectDB() {
    const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
    const tables = [
        `video-course-app-courses-${environment}`,
        `video-course-app-videos-${environment}`
    ];

    console.log(`🕵️ Inspecting tables for environment: ${environment}`);

    for (const tableName of tables) {
        try {
            console.log(`\n--- TABLE: ${tableName} ---`);
            const result = await docClient.send(new ScanCommand({ TableName: tableName }));
            console.log(`Found ${result.Items ? result.Items.length : 0} items.`);
            if (result.Items && result.Items.length > 0) {
                result.Items.forEach((item, i) => {
                    console.log(`Item ${i + 1}:`, {
                        name: item.courseName || item.title || item.name,
                        id: item.videoId || item._id,
                        title: item.title
                    });
                });
            }
        } catch (error) {
            console.error(`❌ Error scanning ${tableName}:`, error.message);
        }
    }
}

inspectDB();
