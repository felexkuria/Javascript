const { AdjustChatExperiencePointsCommand } = require('../../src/services/gamificationManager');
const aiService = require('../../src/services/aiService');
require('dotenv').config();

async function testHistoryEvaluation() {
  console.log('🚀 Testing AI Memory & XP Evaluation...');
  const userId = 'test_user_history@levi.academy';
  
  // Turn 1: AI asks a question
  const history = [
    { role: 'user', content: 'Teach me about h1 tags' },
    { role: 'assistant', content: 'h1 tags are for top-level headings! Can you tell me what tag you would use for a secondary heading?' }
  ];
  
  console.log('--- Simulating Turn 2: Student Answers Correctly ---');
  const answer = "I would use an h2 tag.";
  
  try {
    const result = await aiService.generateChatResponse(answer, "Course: HTML Basics", userId, history);
    
    console.log('🤖 AI Response:', result.response);
    console.log('📈 XP Change:', result.xp_change);
    console.log('💰 New Total:', result.new_total);
    
    if (result.xp_change > 0) {
      console.log('✅ SUCCESS: AI remembered the question and awarded points!');
    } else {
      console.log('❌ FAILURE: AI did not award points despite correct answer context.');
    }
  } catch (err) {
    console.error('❌ Test failed with error:', err.message);
  }
}

testHistoryEvaluation();
