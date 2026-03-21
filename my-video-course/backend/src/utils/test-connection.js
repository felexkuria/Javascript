const { CognitoIdentityProviderClient, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');
const mongoose = require('mongoose');
require('dotenv').config();

// Configuration (Using Terraform-verified IDs)
const COGNITO_USER_POOL_ID = 'us-east-1_yPaLqj6BK';
const COGNITO_CLIENT_ID = '40hg7ml40ktllfio80pqmeupqc';
const MONGODB_URI = 'mongodb://127.0.0.1:27017/videocourse';

async function testCognito() {
  console.log('🔍 Testing Cognito Connection...');
  const client = new CognitoIdentityProviderClient({ region: 'us-east-1' });
  
  try {
    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: COGNITO_CLIENT_ID,
      AuthParameters: {
        USERNAME: 'engineerfelex@gmail.com',
        PASSWORD: 'DummyPassword123!' 
      }
    });

    await client.send(command);
  } catch (error) {
    console.log(`📡 Cognito Response: ${error.name}`);
    if (error.name === 'NotAuthorizedException') {
      console.log('✅ Success: Cognito reachable (Invalid password as expected)');
    } else if (error.name === 'ResourceNotFoundException') {
      console.log('❌ Error: User Pool or Client ID is INCORRECT');
    } else {
      console.log(`❌ Error: ${error.message}`);
    }
  }
}

async function testMongoDB() {
  console.log('\n🔍 Testing MongoDB Connection...');
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000
    });
    console.log('✅ Success: MongoDB connected successfully');
    await mongoose.disconnect();
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    console.log('💡 Tip: Ensure "0.0.0.0/0" is whitelisted in MongoDB Atlas');
  }
}

async function runTests() {
  await testCognito();
  await testMongoDB();
  process.exit(0);
}

runTests();
