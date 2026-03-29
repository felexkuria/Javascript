require('dotenv').config();

async function listModels() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is missing');
    return;
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await response.json();
    
    if (data.models) {
      console.log('✅ Available Models:');
      data.models.forEach(m => {
        console.log(`   - ${m.name} (${m.displayName})`);
      });
    } else {
      console.error('❌ No models found or error response:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Failed to fetch models:', error.message);
  }
}

listModels();
