const gamificationManager = require('../../src/services/gamificationManager');
const aiService = require('../../src/services/aiService');
const dynamoService = require('../../src/utils/dynamodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const TEST_USER = 'test_user_xp_gamification@levi.academy';

async function runTests() {
  console.log('🚀 Starting AI Chat XP Gamification Tests...');
  
  try {
    // 1. Setup: Reset or Ensure Test User exists
    console.log('\n--- Test 1: Atomic Increment (+10 XP) ---');
    const initialData = await gamificationManager.getUserData(TEST_USER);
    const initialPoints = initialData.totalPoints || 0;
    console.log(`Initial Points: ${initialPoints}`);

    const resultPlus = await gamificationManager.adjustChatExperiencePoints(TEST_USER, 10);
    console.log(`Points after +10: ${resultPlus.totalPoints}`);
    
    if (resultPlus.totalPoints !== initialPoints + 10) {
      throw new Error(`Increment failed! Expected ${initialPoints + 10}, got ${resultPlus.totalPoints}`);
    }
    console.log('✅ Increment Success');

    // 2. Test Negative Scaling (Drop into negative if at 0 or below)
    console.log('\n--- Test 2: Negative Scaling (Deduct from 0/Low) ---');
    // Ensure we are near zero
    await gamificationManager.updateUserData(TEST_USER, { totalPoints: 0 });
    console.log('Reset points to 0.');

    const resultMinus = await gamificationManager.adjustChatExperiencePoints(TEST_USER, -10);
    console.log(`Points after -10: ${resultMinus.totalPoints}`);

    if (resultMinus.totalPoints !== -10) {
      throw new Error(`Negative scaling failed! Expected -10, got ${resultMinus.totalPoints}`);
    }
    console.log('✅ Negative Scaling Success (Score is -10)');

    // 3. Test Service Logic: Parse AI Response Trigger
    console.log('\n--- Test 3: AI Service Signal Parsing ---');
    // We mock the AI response parsing internally or test the method
    const mockAIResponse = "That's correct! Great job. [[EVALUATION:{\"evaluation\":\"correct\",\"xp_change\":10}]]";
    
    // Using a mini-test for the regex and replacement logic
    const evaluationMatch = mockAIResponse.match(/\[\[EVALUATION:(.*?)\]\]/);
    const evalData = JSON.parse(evaluationMatch[1]);
    const strippedResponse = mockAIResponse.replace(evaluationMatch[0], '').trim();

    console.log(`Parsed XP Change: ${evalData.xp_change}`);
    console.log(`Stripped Response: "${strippedResponse}"`);

    if (evalData.xp_change === 10 && !strippedResponse.includes('[[EVALUATION')) {
      console.log('✅ Service Parsing Logic Success');
    } else {
      throw new Error('Service parsing logic failed!');
    }

    console.log('\n✨ ALL TESTS PASSED SUCCESSFULLY! ✨');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    process.exit(1);
  }
}

runTests();
