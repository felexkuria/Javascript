let BedrockRuntimeClient, InvokeModelCommand, GoogleGenerativeAI;

try {
  const bedrock = require('@aws-sdk/client-bedrock-runtime');
  BedrockRuntimeClient = bedrock.BedrockRuntimeClient;
  InvokeModelCommand = bedrock.InvokeModelCommand;
} catch (error) {
  console.warn('AWS Bedrock not available:', error.message);
}

try {
  GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;
} catch (error) {
  console.warn('Google Generative AI not available:', error.message);
}

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

  async generateWithNovaPro(prompt, context = {}) {
    const cacheKey = `nova_${Buffer.from(prompt).toString('base64').slice(0, 20)}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (!this.client || !InvokeModelCommand) {
      return await this.fallbackToGemini(prompt, context);
    }

    try {
      const payload = {
        messages: [{
          role: 'user',
          content: `Context: ${JSON.stringify(context)}\n\nPrompt: ${prompt}`
        }],
        inferenceConfig: {
          maxTokens: 2000,
          temperature: 0.9
        }
      };

      const command = new InvokeModelCommand({
        modelId: 'amazon.nova-pro-v1:0',
        body: JSON.stringify(payload),
        contentType: 'application/json'
      });

      const response = await this.client.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.body));
      const content = result.content[0].text;
      
      this.cache.set(cacheKey, content);
      return content;
    } catch (error) {
      console.error('Nova Pro error:', error);
      return await this.fallbackToGemini(prompt, context);
    }
  }

  async generateCourseDescription(courseName, videos) {
    const prompt = `Generate a compelling course description for "${courseName}" with ${videos.length} videos. Include learning objectives, target audience, and key skills covered. Keep it under 200 words.`;
    
    const context = {
      courseName,
      videoCount: videos.length,
      sampleTitles: videos.slice(0, 5).map(v => v.title)
    };

    return await this.generateWithNovaPro(prompt, context);
  }

  async generateTodoFromVideo(videoTitle, transcript = '') {
    const prompt = `Extract 3-5 actionable learning tasks from this video: "${videoTitle}". Format as JSON array with {task, priority, estimated_time}.`;
    
    const context = { videoTitle, transcript: transcript.slice(0, 1000) };
    const response = await this.generateWithNovaPro(prompt, context);
    
    try {
      return JSON.parse(response);
    } catch {
      return [
        { task: `Watch and understand: ${videoTitle}`, priority: 'high', estimated_time: '30 min' },
        { task: 'Take notes on key concepts', priority: 'medium', estimated_time: '15 min' },
        { task: 'Practice examples shown', priority: 'high', estimated_time: '45 min' }
      ];
    }
  }

  async generateQuizFromVideo(videoTitle, transcript = '') {
    const prompt = `Create 3 multiple-choice quiz questions about "${videoTitle}". Return JSON array with {question, options, correct, explanation}.`;
    
    const context = { videoTitle, transcript: transcript.slice(0, 1500) };
    const response = await this.generateWithNovaPro(prompt, context);
    
    try {
      return JSON.parse(response);
    } catch {
      return [{
        question: `What is the main topic covered in "${videoTitle}"?`,
        options: ['Basic concepts', 'Advanced techniques', 'Practical examples', 'All of the above'],
        correct: 3,
        explanation: 'This video covers comprehensive content including concepts, techniques, and examples.'
      }];
    }
  }

  async generateDavidMalanResponse(question, context) {
    const prompt = `Respond as David J. Malan from CS50. Be encouraging, use analogies, and explain concepts clearly. Question: "${question}"`;
    
    const malanContext = {
      ...context,
      style: 'David J. Malan teaching style',
      tone: 'encouraging and clear'
    };

    return await this.generateWithNovaPro(prompt, malanContext);
  }

  async analyzeVideoContent(videoTitle, transcript = '') {
    const prompt = `Analyze this video and provide: 1) Summary (50 words), 2) Key topics (5 bullet points), 3) Difficulty level. Video: "${videoTitle}"`;
    
    const context = { videoTitle, transcript: transcript.slice(0, 2000) };
    const response = await this.generateWithNovaPro(prompt, context);
    
    return {
      summary: response.split('Summary:')[1]?.split('Key topics:')[0]?.trim() || 'Video content analysis',
      keyTopics: response.split('Key topics:')[1]?.split('Difficulty:')[0]?.trim().split('\n') || ['Key concepts'],
      difficulty: response.split('Difficulty:')[1]?.trim() || 'Intermediate'
    };
  }

  async generateCaptionsFromSRT(srtContent, videoTitle) {
    const prompt = `Improve these video captions for "${videoTitle}". Fix grammar, add punctuation, and make them more readable while keeping timestamps intact.`;
    
    const context = { videoTitle, srtLength: srtContent.length };
    const response = await this.generateWithNovaPro(prompt + '\n\nSRT Content:\n' + srtContent.slice(0, 3000), context);
    
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
    return await this.generateWithNovaPro(prompt + '\n\nTranscript:\n' + textOnly.slice(0, 4000), context);
  }

  async fallbackToGemini(prompt, context) {
    if (!this.genAI) {
      return this.staticFallback(prompt, context);
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const fullPrompt = `Context: ${JSON.stringify(context)}\n\nPrompt: ${prompt}`;
      
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Gemini fallback failed:', error);
      return this.staticFallback(prompt, context);
    }
  }

  staticFallback(prompt, context) {
    if (prompt.includes('course description')) {
      return `This comprehensive course covers essential topics in ${context.courseName || 'the subject'}. Perfect for learners looking to master key concepts through hands-on practice and real-world examples.`;
    }
    if (prompt.includes('David J. Malan')) {
      return 'That\'s a great question! Let me break this down for you step by step. Think of it like...';
    }
    return 'I\'m here to help you learn! Could you rephrase your question?';
  }
}

module.exports = new AIService();