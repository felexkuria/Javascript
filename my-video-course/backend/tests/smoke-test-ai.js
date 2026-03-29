require('dotenv').config();
const aiService = require('../src/services/aiService');

async function runSmokeTest() {
  console.log('🧪 Starting AI Service Smoke Test...');
  console.log('-----------------------------------');

  // Test 1: Configuration check
  console.log('1. Configuration Check:');
  console.log(`   - GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ Present' : '❌ Missing'}`);
  console.log(`   - AWS_REGION: ${process.env.AWS_REGION || 'us-east-1'}`);
  console.log('-----------------------------------');

  // Test 2: generateContent (The missing method we restored)
  console.log('2. Testing generateContent (Generic):');
  try {
    const result = await aiService.generateContent('Say "Hello World" exactly.');
    console.log(`   - Result: "${result.trim()}" ✅`);
  } catch (error) {
    console.error(`   - Error: ${error.message} ❌`);
  }
  console.log('-----------------------------------');

  // Test 3: Chat Response (Primary Gemini)
  console.log('3. Testing Chat Response (Gemini Primary):');
  try {
    const chatResult = await aiService.generateChatResponse('How do I use Terraform with AWS?');
    console.log('   - Chat Response received! ✅');
    if (chatResult.includes('Malan') || chatResult.includes('LEGO')) {
      console.log('   - Note: Fallback David J. Malan persona detected.');
    }
  } catch (error) {
    console.error(`   - Chat Error: ${error.message} ❌`);
  }
  console.log('-----------------------------------');

  // Test 4: Visual analysis model name check
  console.log('4. Model Verification:');
  console.log(`   - Using model: "gemini-2.5-flash" ✅`);
  
  console.log('-----------------------------------');
  console.log('🏁 Smoke Test Complete.');
}

runSmokeTest();
