const authService = require('../src/services/authService');
const cognitoService = require('../src/services/cognitoService');
const dynamodb = require('../src/utils/dynamodb');

// Mock Cognito
cognitoService.signIn = async (email, password) => {
    console.log(`📡 Mocked Cognito login for ${email}`);
    return { success: true, email };
};

async function testFix() {
  const email = 'engineerfelex@gmail.com';
  const password = 'hyjnij-honrun-2cEdju';

  console.log('🧪 Testing Auth Fix...');
  try {
    const user = await authService.login(email, password);
    console.log('✅ Auth result:', JSON.stringify(user, null, 2));
    
    // Check if it's saved in DB
    const dbUser = await dynamodb.getUser(email);
    console.log('🗄️ Database record:', !!dbUser && !!dbUser.password ? 'HASH PRESENT' : 'MISSING');
  } catch (error) {
    console.error('❌ Auth failed:', error.message);
  }
}

testFix();
