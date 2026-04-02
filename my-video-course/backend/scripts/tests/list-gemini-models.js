const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function listModels() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not found in environment');
    return;
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // There isn't a direct listModels in the high-level SDK easily, 
    // but we can try to instantiate common ones and check for errors, 
    // or use the base fetch if we had the discovery doc.
    // However, the best way is usually to try 'gemini-1.5-flash' vs 'gemini-1.5-pro' vs 'gemini-pro'.
    
    console.log('🔍 Testing Gemini Model Connectivity...');
    
    const modelsToTest = [
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-pro',
      'gemini-1.0-pro',
      'gemini-1.5-flash-001',
      'gemini-1.5-pro-001'
    ];

    for (const modelName of modelsToTest) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent('ping');
        const response = await result.response;
        console.log(`✅ Model "${modelName}" is AVAILABLE. Response: ${response.text().slice(0, 10)}...`);
      } catch (err) {
        console.log(`❌ Model "${modelName}" FAILED: ${err.message.split('\n')[0]}`);
      }
    }
  } catch (error) {
    console.error('Error during listModels:', error.message);
  }
}

listModels();
