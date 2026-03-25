const dynamodb = require('../src/utils/dynamodb');

async function initDynamo() {
  console.log('🚀 Initializing DynamoDB Tables...');
  try {
    const success = await dynamodb.createTables();
    if (success) {
      console.log('✨ DynamoDB initialization complete!');
      process.exit(0);
    } else {
      console.error('❌ DynamoDB initialization failed.');
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Unexpected error:', error.message);
    process.exit(1);
  }
}

initDynamo();
