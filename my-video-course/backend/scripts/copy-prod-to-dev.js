const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const tables = ['courses', 'videos', 'users', 'enrollments', 'captions', 'certificates', 'gamification'];

async function copyTable(tableName) {
    const sourceTable = `video-course-app-${tableName}-prod`;
    const destTable = `video-course-app-${tableName}-dev`;
    
    console.log(`Copying ${sourceTable} -> ${destTable}...`);
    
    try {
        let lastKey = null;
        let count = 0;
        do {
            const scanParams = { TableName: sourceTable };
            if (lastKey) scanParams.ExclusiveStartKey = lastKey;
            
            const scanResult = await docClient.send(new ScanCommand(scanParams));
            const items = scanResult.Items || [];
            
            for (const item of items) {
                await docClient.send(new PutCommand({
                    TableName: destTable,
                    Item: item
                }));
                count++;
            }
            lastKey = scanResult.LastEvaluatedKey;
        } while (lastKey);
        
        console.log(`Done copying ${tableName}. Total items: ${count}`);
    } catch (err) {
        console.error(`Error copying ${tableName}:`, err.message);
    }
}

async function run() {
    for (const table of tables) {
        await copyTable(table);
    }
}

run();
