require('dotenv').config();
const cognitoService = require('../services/cognitoService');

async function testAuth() {
    const email = 'engineerfelex@gmail.com';
    const password = 'test12345';

    console.log(`🔍 Testing Cognito Authentication for: ${email}`);
    console.log(`⚙️  Region: ${process.env.AWS_REGION || 'us-east-1'}`);
    console.log(`🆔 Pool: ${process.env.COGNITO_USER_POOL_ID}`);
    console.log(`📦 Client: ${process.env.COGNITO_CLIENT_ID}`);

    try {
        console.log('--- Phase 1: Attempting SignIn ---');
        const result = await cognitoService.signIn(email, password);
        console.log('✅ Success! AuthenticationResult received.');
        console.log('Tokens received:', Object.keys(result));
    } catch (error) {
        console.log(`❌ SignIn Failed: ${error.name} - ${error.message}`);
        
        if (error.name === 'NotAuthorizedException' || error.name === 'UserNotFoundException') {
            console.log('--- Phase 2: Attempting Admin Setup (Provisioning User) ---');
            try {
                const adminKey = process.env.ADMIN_KEY || 'admin123';
                console.log(`🛠️  Using Admin Key: ${adminKey}`);
                
                // We use the service method directly to bypass the role check
                const setupResult = await cognitoService.adminCreateUser(email, password);
                console.log('✅ Admin Setup Success! User provisioned and confirmed.');
                
                console.log('--- Phase 3: Retrying SignIn ---');
                const retryResult = await cognitoService.signIn(email, password);
                console.log('✅ Success! Authentication confirmed after auto-provisioning.');
            } catch (setupError) {
                console.log(`❌ Admin Setup Failed: ${setupError.name} - ${setupError.message}`);
                console.log('💡 TIP: Check if your AWS credentials in .env have "cognito-idp:AdminCreateUser" permissions.');
            }
        } else if (error.name === 'UserNotConfirmedException') {
            console.log('💡 TIP: The user exists but is not confirmed. Use setup-cognito.sh or the AWS Console.');
        }
    }
}

testAuth();
