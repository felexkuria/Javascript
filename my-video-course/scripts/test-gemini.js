const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGemini() {
  console.log('🔍 Testing Gemini Integration...');
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not found in .env');
    process.exit(1);
  }

  console.log(`🔑 Using API Key: ${apiKey.substring(0, 8)}...`);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const prompt = "Briefly introduce yourself as a helpful coding assistant for a video course platform.";
    console.log(`📝 Prompt: ${prompt}`);
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('\n--- Gemini Response ---');
    console.log(text);
    console.log('------------------------');
    console.log('✅ Gemini Integration Working!');
  } catch (error) {
    console.error('❌ Gemini Error:', error.message);
    if (error.response) {
      console.error('Response Data:', error.response.data);
    }
  }
}

testGemini();
