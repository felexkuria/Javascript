let BedrockRuntimeClient, InvokeModelCommand, ConverseCommand, GoogleGenerativeAI;

try {
  const bedrock = require('@aws-sdk/client-bedrock-runtime');
  BedrockRuntimeClient = bedrock.BedrockRuntimeClient;
  InvokeModelCommand = bedrock.InvokeModelCommand;
  ConverseCommand = bedrock.ConverseCommand;
} catch (error) {
  console.warn('AWS Bedrock not available:', error.message);
}

try {
  GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;
} catch (error) {
  console.warn('Google Generative AI not available:', error.message);
}

const promptManager = require('./promptManager');

class AIService {
  constructor() {
    this.client = null;
    this.cache = new Map();
    
    // Initialize Bedrock if available
    if (BedrockRuntimeClient) {
      try {
        this.client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
        console.log('✅ AWS Bedrock initialized');
      } catch (error) {
        console.warn('Failed to initialize Bedrock:', error.message);
      }
    }
    
    // Initialize Gemini as fallback
    this.genAI = null;
    if (GoogleGenerativeAI && process.env.GEMINI_API_KEY) {
      try {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        console.log('✅ Gemini AI initialized as fallback');
      } catch (error) {
        console.warn('Failed to initialize Gemini:', error.message);
      }
    }
  }
   async generateWithNova(prompt, systemPrompt = "You are a helpful assistant.") {
    // 1. Check for custom Proxy Endpoint first (Premium High-Fidelity Flow)
    if (process.env.NOVA_ENDPOINT && process.env.NOVA_API_KEY && process.env.NOVA_API_KEY.includes('bedrock-api-key')) {
      try {
        console.log('🚀 Using Premium Nova Proxy Endpoint for high-fidelity generation...');
        const response = await fetch(process.env.NOVA_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NOVA_API_KEY}`
          },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ],
            model: 'nova-lite-v1', // Updated to Lite
            temperature: 0.7,
            max_tokens: 4096
          })
        });

        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          return data.choices[0].message.content;
        }
        console.warn('⚠️ Proxy response invalid or empty, falling back to Bedrock SDK...');
      } catch (proxyError) {
        console.error('❌ Nova Proxy Error:', proxyError.message);
      }
    }

    // 2. Optimized Bedrock SDK Flow (Using Converse API)
    try {
      if (!this.client || !ConverseCommand) {
        throw new Error("AWS Bedrock Converse client not initialized.");
      }

      const command = new ConverseCommand({
        modelId: "amazon.nova-lite-v1:0", // Matches approved quota
        system: [{ text: systemPrompt }],
        messages: [
          {
            role: "user",
            content: [{ text: prompt }]
          }
        ],
        inferenceConfig: {
          maxTokens: 4096,
          temperature: 0.7,
          topP: 0.9,
        }
      });

      const response = await this.client.send(command);
      return response.output.message.content[0].text;
    } catch (error) {
      console.error("❌ Bedrock Nova Error:", error.message);
      
      if (error.name === 'ThrottlingException' || error.message.includes('Too many tokens')) {
        console.log('🔄 Throttled on Bedrock, switching to Gemini fallback...');
      }
      
      // Final fallback to Gemini
      return await this.fallbackToGemini(prompt, { systemPrompt });
    }
  }

  async generateCourseDescription(courseName, videos) {
    const prompt = `Generate a compelling course description for "${courseName}" with ${videos.length} videos. Include learning objectives, target audience, and key skills covered. Keep it under 200 words.`;
    return await this.generateWithNova(prompt, "You are an expert curriculum designer.");
  }

  async generateTodoFromVideo(videoTitle, transcript = '') {
    return await this.generateTodos(transcript, 'video', videoTitle);
  }

  async generateTodoFromSRT(srtContent, videoTitle) {
    const textOnly = srtContent
      .split('\n')
      .filter(line => !line.match(/^\d+$/) && !line.match(/\d{2}:\d{2}:\d{2}/) && line.trim())
      .join(' ');
    
    return await this.generateTodoFromVideo(videoTitle, textOnly);
  }

  async generateQuizFromSRT(srtContent, videoTitle) {
    const textOnly = srtContent
      .split('\n')
      .filter(line => !line.match(/^\d+$/) && !line.match(/\d{2}:\d{2}:\d{2}/) && line.trim())
      .join(' ');
    
    return await this.generateQuizFromVideo(videoTitle, textOnly);
  }

  async generateQuizFromVideo(videoTitle, transcript = '') {
    const { system, user } = promptManager.getPrompt('technical_quiz', { title: videoTitle, transcript: transcript.slice(0, 3000) });
    const response = await this.generateWithNova(user, system);
    try {
      return JSON.parse(response);
    } catch {
      return [{
        question: `What is the main concept covered in "${videoTitle}"?`,
        options: ['Concepts', 'Techniques', 'Examples', 'All of the above'],
        correct: 3,
        explanation: 'This video covers comprehensive concepts and practical implementations.'
      }];
    }
  }

  async generateChatResponse(message, context = {}) {
    try {
      // High-performance chat prioritized on Gemini 1.5 Flash for low latency
      if (this.genAI) {
        return await this.generateDavidMalanResponse(message, context);
      }
      return await this.generateWithNova(message, "You are a helpful assistant.");
    } catch (error) {
      console.warn("AI chat failed, falling back to static:", error.message);
      return this.staticMalanResponse(message, context);
    }
  }

  async analyzeVisualContent(title, previews = []) {
    if (!previews || previews.length === 0) return "No visual data available.";
    
    const { system, user } = promptManager.getPrompt('visual_reasoning', { title });
    
    // In Phase 1: We use Gemini 1.1 Flash for visual summaries to keep it fast
    try {
      if (!this.genAI) return "Vision AI not configured.";
      
      const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
      
      // Prepare image parts (for now just the first 3 frames for key insights)
      const imageParts = await Promise.all(previews.slice(0, 3).map(async (url) => {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        return {
          inlineData: {
            data: Buffer.from(buffer).toString("base64"),
            mimeType: "image/jpeg"
          }
        };
      }));

      const result = await model.generateContent([user, ...imageParts]);
      const response = await result.response;
      return response.text();
    } catch (error) {
       console.error("Multimodal analysis failed:", error.message);
       return "Visual analysis timed out.";
    }
  }

  async generateDavidMalanResponse(question, context) {
    const { system, user } = promptManager.getPrompt('david_malan', { 
      question, 
      context: context?.transcript ? context.transcript.slice(0, 1000) : '' 
    });
    return await this.fallbackToGemini(user, { systemPrompt: system });
  }
  
  staticMalanResponse(question, context) {
    return `That's a great question! Let me break this down for you step by step. Think of it like building with LEGO blocks - each concept connects to create something bigger. the key thing to remember is that learning happens one step at a time. What specifically would you like me to clarify?`;
  }

  async analyzeVideoContent(videoTitle, transcript = '') {
    const prompt = `Analyze this video and provide: 1) Summary (50 words), 2) Key topics (5 bullet points), 3) Difficulty level. Video: "${videoTitle}"`;
    
    const context = { videoTitle, transcript: transcript.slice(0, 2000) };
    const response = await this.generateWithNova(prompt, context);
    
    return {
      summary: response.split('Summary:')[1]?.split('Key topics:')[0]?.trim() || 'Video content analysis',
      keyTopics: response.split('Key topics:')[1]?.split('Difficulty:')[0]?.trim().split('\n') || ['Key concepts'],
      difficulty: response.split('Difficulty:')[1]?.trim() || 'Intermediate'
    };
  }

  async generateCaptionsFromSRT(srtContent, videoTitle) {
    const prompt = `Improve these video captions for "${videoTitle}". Fix grammar, add punctuation, and make them more readable while keeping timestamps intact.`;
    
    const context = { videoTitle, srtLength: srtContent.length };
    const response = await this.generateWithNova(prompt + '\n\nSRT Content:\n' + srtContent.slice(0, 3000), context);
    
    return response || srtContent; // Return improved SRT or original if AI fails
  }

  async summarizeFromSRT(srtContent, videoTitle) {
    // Extract text from SRT
    const textOnly = srtContent
      .split('\n')
      .filter(line => !line.match(/^\d+$/) && !line.match(/\d{2}:\d{2}:\d{2}/) && line.trim())
      .join(' ');
    
    const prompt = `Create a concise summary (100 words) of this video transcript: "${videoTitle}"`;
    
    const context = { videoTitle, transcriptLength: textOnly.length };
    const result = await this.generateWithNova(prompt + '\n\nTranscript:\n' + textOnly.slice(0, 4000), context);
    const summary = typeof result === 'string' ? result : `Summary for ${videoTitle}: This video covers key concepts and practical examples.`;
    return summary;
  }

  async generateTodos(content, type = 'video', title = '') {
    const systemPrompt = `You are an expert educational architect. Extract 3-5 actionable learning tasks from the provided ${type} content.
    Return ONLY a valid JSON array of objects with the following schema:
    [
      { "text": "Actionable task string", "category": "Setup/Practice/Theory", "priority": "high/medium/low", "estimatedTime": "approx time" }
    ]
    Response format: JSON`;
    
    const prompt = `Content Title: ${title}\n\nContent Content:\n${content}`;
    
    try {
      return await this.generateWithNova(prompt, systemPrompt);
    } catch (error) {
      console.warn("Nova todo extraction failed, falling back to Gemini:", error.message);
      return await this.fallbackToGemini(prompt, { systemPrompt });
    }
  }

  async getAIModelStatus() {
    return {
      activeModel: "Amazon Nova Lite",
      provider: "AWS Bedrock",
      isConfigured: !!(process.env.AWS_REGION && (process.env.AWS_ACCESS_KEY_ID || process.env.IAM_ROLE_ACTIVE)),
      region: process.env.AWS_REGION || 'us-east-1'
    };
  }

  async fallbackToGemini(prompt, context) {
    if (!this.genAI) {
      return this.staticFallback(prompt, context);
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
      const fullPrompt = `${context.systemPrompt || ''}\n\nPrompt: ${prompt}`;
      
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Gemini fallback failed:', error);
      return this.staticFallback(prompt, context);
    }
  }

  staticFallback(prompt, context) {
    if (prompt.includes('David J. Malan')) {
      return 'That\'s a great question! Let me break this down for you step by step...';
    }
    return 'I\'m here to help you learn! Cloud engineering is about building robust systems.';
  }
}

module.exports = new AIService();