const { DynamoDBClient, ScanCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const REGION = process.env.AWS_REGION || 'us-east-1';
const ENV = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

const client = new DynamoDBClient({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const TABLES = [
  { name: `video-course-app-videos-${ENV}`, keys: ['courseName', 'videoId'] },
  { name: `video-course-app-courses-${ENV}`, keys: ['courseName'] },
  { name: `video-course-app-users-${ENV}`, keys: ['email'] },
  { name: `video-course-app-enrollments-${ENV}`, keys: ['userId', 'courseName'] },
  { name: `video-course-app-gamification-${ENV}`, keys: ['userId'] },
  { name: `video-course-app-captions-${ENV}`, keys: ['courseName', 'videoId'] },
  { name: `video-course-app-dlq-${ENV}`, keys: ['correlationId', 'timestamp'] }
];

async function purgeTable(tableConfig) {
  console.log(`\n🔥 Purging Table: ${tableConfig.name}...`);
  try {
    const scanResult = await client.send(new ScanCommand({
      TableName: tableConfig.name,
      ProjectionExpression: tableConfig.keys.join(', ')
    }));

    if (!scanResult.Items || scanResult.Items.length === 0) {
      console.log(`✅ Table is already empty.`);
      return;
    }

    console.log(`🗑️  Found ${scanResult.Items.length} items. Deleting...`);
    
    for (const item of scanResult.Items) {
      const key = {};
      tableConfig.keys.forEach(k => {
        key[k] = item[k];
      });

      await client.send(new DeleteItemCommand({
        TableName: tableConfig.name,
        Key: key
      }));
    }
    console.log(`✨ Successfully purged ${tableConfig.name}`);
  } catch (error) {
    console.error(`❌ Error purging ${tableConfig.name}:`, error.message);
  }
}

async function startPurge() {
  console.log(`====================================================`);
  console.log(`🚨 DYNAMODB PURGE SEQUENCE INITIATED (ENV: ${ENV}) 🚨`);
  console.log(`====================================================`);
  
  for (const table of TABLES) {
    await purgeTable(table);
  }
  
  console.log(`\n✅ ALL DATA CLEAR. SYSTEM READY FOR FRESH INGESTION.`);
}

startPurge();
