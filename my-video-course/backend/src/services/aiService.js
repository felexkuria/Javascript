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
const gamificationManager = require('./gamificationManager');
const { QuizSchema, TodoSchema, VideoMetadataSchema } = require('../models/schema');

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
    this.geminiDisabled = false; // Proactive failover for leaked keys
    if (GoogleGenerativeAI && process.env.GEMINI_API_KEY) {
      try {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        console.log('✅ Gemini AI initialized as fallback');
      } catch (error) {
        console.warn('Failed to initialize Gemini:', error.message);
      }
    }
  }

  async generateContent(prompt, options = {}) {
    // 1. Primary Priority: Bedrock SDK (Converse API)
    // 2. Secondary Priority: Nova Proxy 
    // 3. Fallback: Gemini 1.5 Flash
    try {
      return await this.generateWithNova(prompt, options.systemPrompt);
    } catch (error) {
      console.warn("Nova generation (SDK + Proxy) failed, falling back to Gemini:", error.message);
      return await this.fallbackToGemini(prompt, { systemPrompt: options.systemPrompt });
    }
  }

   async generateWithNova(prompt, systemPrompt = "You are a helpful assistant.") {
    // 1. Primary: Optimized Bedrock SDK Flow (Using Converse API with provided keys)
    try {
      if (!this.client || !ConverseCommand) {
        throw new Error("AWS Bedrock Converse client not initialized.");
      }

      console.log('🚀 Attempting direct AWS Bedrock SDK (nova-lite)...');
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
      console.log('✅ Success: AWS Bedrock SDK (Standard)');
      return response.output.message.content[0].text;
    } catch (sdkError) {
      console.warn("⚠️ Bedrock SDK Error:", sdkError.message);
      
      // 2. Secondary: Check for custom Proxy Endpoint (Failover Flow)
      if (process.env.NOVA_ENDPOINT && process.env.NOVA_API_KEY) {
        try {
          console.log('🔄 SDK failed, falling back to Nova Proxy Endpoint...');
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s Timeout

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
            }),
            signal: controller.signal
          });

          clearTimeout(timeoutId);
          const data = await response.json();
          if (data.choices && data.choices[0] && data.choices[0].message) {
            console.log('✅ Success: Nova Proxy Endpoint');
            return data.choices[0].message.content;
          }
        } catch (proxyError) {
          console.error('❌ Nova Proxy Error:', proxyError.message);
        }
      }
      
      throw sdkError; // If both fail, trigger Gemini fallback
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

  /**
   * Pillar 1 Implementation: Strip filler text and validate again strict Zod contract.
   * If validation fails, it attempts a recursive self-correction retry.
   */
  async cleanAndParseJSON(response, schema, retryContext = null) {
    try {
      if (!response) throw new Error("Empty AI response");
      
      // 1. Strip Common LLM Fillers
      const jsonMatch = response.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
      const rawJson = jsonMatch ? jsonMatch[0] : response;
      const parsed = JSON.parse(rawJson);
      
      // 2. Strict Zod Validation
      return schema.parse(parsed);

    } catch (error) {
      console.warn(`⚠️ Schema Validation Error: ${error.message}`);
      
      // 3. Automated Error Correction Retry (Only once)
      if (retryContext && !retryContext.isRetry) {
        console.log(`🔄 Attempting AI Self-Correction for: ${retryContext.type}...`);
        const correctionPrompt = `Your previous response had a validation error: "${error.message}". 
        Please fix the JSON and return ONLY the valid JSON data according to the schema. 
        Original query: ${retryContext.prompt}`;
        
        const retryResponse = await this.generateWithNova(correctionPrompt, "You are a JSON correction assistant. Return ONLY JSON.");
        return this.cleanAndParseJSON(retryResponse, schema, { ...retryContext, isRetry: true });
      }

      throw error; // Bubble up if retry also fails or not provided
    }
  }

  async generateQuizQuestions(transcript, videoTitle) {
    const { system, user } = promptManager.getPrompt('technical_quiz', { title: videoTitle, transcript: transcript.slice(0, 4000) });
    
    try {
      const response = await this.generateWithNova(user, system);
      return await this.cleanAndParseJSON(response, QuizSchema, { 
        type: 'Quiz', 
        prompt: user 
      });
    } catch (error) {
      console.error(`❌ Final Quiz Extraction Failure: ${error.message}`);
      // Fallback to static safe default to prevent pipeline crash
      return [{
        question: `What is the main concept covered in "${videoTitle}"?`,
        options: ['System Architecture', 'Implementation Techniques', 'Strategic Planning', 'Operational Excellence'],
        correct: 0,
        explanation: 'This module focuses on the core building blocks of high-fidelity engineering systems.'
      }];
    }
  }

  async generateLab(transcript, videoTitle) {
    const { system, user } = promptManager.getPrompt('technical_lab', { title: videoTitle, transcript: transcript.slice(0, 4000) });
    const response = await this.generateWithNova(user, system);
    try {
      // Use dynamic Zod validation for Labs (flexible but structured)
      const LabSchema = require('zod').object({
        title: require('zod').string(),
        scenario: require('zod').string(),
        objectives: require('zod').array(require('zod').string()),
        steps: require('zod').array(require('zod').string()),
        difficulty: require('zod').string()
      });
      return await this.cleanAndParseJSON(response, LabSchema, { type: 'Lab', prompt: user });
    } catch {
      return {
        title: `${videoTitle} Application Lab`,
        scenario: 'Implement the core architectural patterns discussed in the video.',
        objectives: ['Deploy basic infrastructure', 'Verify connectivity'],
        steps: ['Access the cloud console', 'Initialize the requested resources'],
        difficulty: 'Intermediate'
      };
    }
  }

  async generateQuizFromVideo(videoTitle, transcript = '') {
    return this.generateQuizQuestions(transcript, videoTitle);
  }

  async generateChatResponse(message, context = {}, userId = 'engineerfelex@gmail.com', history = []) {
    // Fetch user context for gamification (mentions)
    const userData = await gamificationManager.getUserData(userId);
    const currentPoints = userData.totalPoints || 0;

    // Format chat history (last 5 turns) for context
    const formattedHistory = (history || []).slice(-5).map(msg => {
      const content = msg.content || msg.c || msg.message;
      const role = (msg.role === 'user' || msg.user === true) ? 'Student' : 'David J. Malan';
      return content ? `${role}: ${content}` : '';
    }).filter(line => line !== '').join('\n');

    console.log(`🧠 AI Memory Sync: Processing ${history ? history.length : 0} turns for ${userId}`);

    const { system, user } = promptManager.getPrompt('david_malan', { 
      question: message, 
      history: formattedHistory || "No previous history.",
      context: typeof context === 'string' ? context : (context?.transcript ? context.transcript.slice(0, 1000) : '')
    });

    let aiResponse = '';

    // 1. Primary Priority: Nova (Direct SDK or Proxy)
    try {
      console.log('🚀 Attempting Amazon Nova (SDK/Proxy)...');
      aiResponse = await this.generateWithNova(user, system);
    } catch (novaError) {
      console.warn("⚠️ Nova Engine failed, trying Gemini:", novaError.message);
      
      // 2. Secondary Priority: Gemini
      if (this.genAI && !this.geminiDisabled) {
        try {
          console.log('🚀 Attempting Google Gemini failover...');
          let model;
          try {
            model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); 
          } catch (setupError) {
            console.warn("⚠️ Gemini-1.5-flash setup failed, using pro fallback...");
            model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
          }
          
          const result = await model.generateContent(`${system}\n\nUser: ${user}`);
          const response = await result.response;
          aiResponse = response.text();
          console.log('✅ Success: Google Gemini');
        } catch (geminiError) {
          console.warn("❌ Gemini failover failed:", geminiError.message);
        }
      }
    }

    // 3. Final Fallback: Static Offline
    if (!aiResponse) {
      console.warn("❌ All AI engines failed entirely. Activating static offline fallback.");
      aiResponse = this.staticMalanResponse(message, context);
    }

    // Intercept evaluation trigger
    let xp_change = 0;
    let new_total = null;
    
    // Always fetch latest total from DynamoDB (Source of Truth)
    const currentSync = await gamificationManager.getUserData(userId);
    new_total = currentSync.totalPoints;
    
    const evaluationMatch = aiResponse.match(/\[\[EVALUATION:(.*?)\]\]/);
    if (evaluationMatch) {
      try {
        const evalData = JSON.parse(evaluationMatch[1]);
        xp_change = evalData.xp_change || 0;
        
        console.log(`🎯 AI Evaluation Signal Detected for ${userId}: ${xp_change > 0 ? '+' : ''}${xp_change} XP`);
        
        // Award/Deduct XP atomically
        const result = await gamificationManager.adjustChatExperiencePoints(userId, xp_change);
        new_total = result.totalPoints;
        
        // Strip trigger from response
        aiResponse = aiResponse.replace(evaluationMatch[0], '').trim();
      } catch (parseError) {
        console.error('❌ Failed to parse evaluation trigger:', parseError.message);
      }
    } else {
      console.log(`ℹ️ No AI Evaluation Signal detected for ${userId}. Current Total: ${new_total}`);
    }
    
    return { 
      response: aiResponse, 
      xp_change, 
      new_total 
    };
  }

  async analyzeVisualContent(title, previews = []) {
    if (!previews || previews.length === 0) return "No visual data available.";
    
    const { system, user } = promptManager.getPrompt('visual_reasoning', { title });
    
    // In Phase 1: We use Gemini 2.0 Flash for visual summaries
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


  staticMalanResponse(question, context) {
    return `That's a great question! Let me break this down for you step by step. Think of it like building with LEGO blocks - each concept connects to create something bigger. the key thing to remember is that learning happens one step at a time. What specifically would you like me to clarify?`;
  }

  async analyzeVideoContent(videoTitle, transcript = '') {
    const { system, user } = promptManager.getPrompt('video_analysis', { title: videoTitle, transcript: transcript.slice(0, 4000) });
    
    try {
      const response = await this.generateWithNova(user, system);
      return await this.cleanAndParseJSON(response, VideoMetadataSchema, {
        type: 'Analysis',
        prompt: user
      });
    } catch (error) {
      console.warn(`⚠️ Video analysis extraction failed: ${error.message}`);
      return {
        summary: 'Video content analysis in progress...',
        keyTopics: ['Technical implementation', 'Architecture overview'],
        difficulty: 'Intermediate',
        tags: ['video', 'learning']
      };
    }
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
    const { system, user } = promptManager.getPrompt('todo_extraction', { title, content: content.slice(0, 4000) });
    
    try {
      const response = await this.generateWithNova(user, system);
      return await this.cleanAndParseJSON(response, TodoSchema, {
        type: 'Todos',
        prompt: user
      });
    } catch (error) {
      console.warn(`⚠️ Todo extraction failed: ${error.message}`);
      return await this.fallbackToGemini(user, { systemPrompt: system });
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
    if (!this.genAI || this.geminiDisabled) {
      return this.staticFallback(prompt, context);
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
      const fullPrompt = `${context.systemPrompt || ''}\n\nPrompt: ${prompt}`;
      
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      if (error.message.includes('403') || error.message.includes('leaked')) {
        this.geminiDisabled = true;
      }
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