const dynamodb = require('../../src/utils/dynamodb');
const { GetCommand } = require('@aws-sdk/lib-dynamodb');

async function debugData() {
  const userId = 'engineerfelex@gmail.com';
  const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
  const tableName = `video-course-app-gamification-${environment}`;

  console.log(`🔍 Debugging Raw DynamoDB record for ${userId} in ${tableName}...`);

  const params = {
    TableName: tableName,
    Key: { userId: userId }
  };

  try {
    const result = await dynamodb.docClient.send(new GetCommand(params));
    console.log('📦 Raw Record:', JSON.stringify(result.Item, null, 2));
  } catch (e) {
    console.error('❌ Error fetching record:', e.message);
  }
}

debugData().catch(console.error);
