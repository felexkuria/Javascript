const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIService {
  constructor() {
    // Gemini setup
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.geminiModel = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    // Amazon Nova setup
    this.novaApiKey = process.env.NOVA_API_KEY;
    this.novaEndpoint = process.env.NOVA_ENDPOINT || 'https://nova-lite-v1.us-east-1.amazonaws.com/v1/chat/completions';
  }

  // Main AI generation method with Nova first, Gemini failover
  async generateContent(prompt, options = {}) {
    try {
      // Try Amazon Nova first
      console.log('Attempting Amazon Nova AI...');
      const response = await this.callNovaAPI(prompt, options);
      console.log('Amazon Nova successful');
      return response;
    } catch (novaError) {
      console.warn('Amazon Nova failed:', novaError.message);
      
      try {
        // Fallback to Gemini
        console.log('Falling back to Gemini...');
        const result = await this.geminiModel.generateContent(prompt);
        const response = result.response.text();
        console.log('Gemini AI successful');
        return response;
      } catch (geminiError) {
        console.error('Both AI services failed:', { nova: novaError.message, gemini: geminiError.message });
        throw new Error('All AI services unavailable');
      }
    }
  }

  // Amazon Nova API call
  async callNovaAPI(prompt, options = {}) {
    const response = await fetch(this.novaEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.novaApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'amazon.nova-lite-v1:0',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: options.maxTokens || 2000,
        temperature: options.temperature || 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`Nova API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  // Specialized methods for different use cases
  async generateQuizQuestions(content, videoTitle) {
    const prompt = `Based on this video content, create 5 multiple-choice quiz questions.

Video: ${videoTitle}
Content: ${content.substring(0, 2000)}

Return JSON array:
[{
  "id": "q1",
  "question": "Question text?",
  "options": ["A", "B", "C", "D"],
  "correct": 0,
  "explanation": "Why this is correct"
}]

Return only the JSON array.`;

    return this.generateContent(prompt);
  }

  async generateTodos(content, source, title) {
    const prompt = `Extract actionable learning tasks from this ${source} content.

Title: ${title}
Content: ${content.substring(0, 2500)}

Return JSON array:
[{
  "id": "unique_id",
  "text": "Clear, actionable task description",
  "category": "Setup|Practice|Configuration|Testing|Learning",
  "priority": "high|medium|low",
  "estimatedTime": "5-30 min",
  "source": "${source}"
}]

Focus on practical, hands-on tasks. Return only the JSON array.`;

    return this.generateContent(prompt);
  }

  async generateSummaryAndTopics(content, title) {
    const prompt = `Create a concise summary and key topics for this content.

Title: ${title}
Content: ${content.substring(0, 2000)}

Return JSON:
{
  "summary": "2-3 sentence summary",
  "keyTopics": ["topic1", "topic2", "topic3", "topic4", "topic5"]
}

Return only the JSON object.`;

    return this.generateContent(prompt);
  }

  async generateChatResponse(message, context = '') {
    const prompt = `You are a course teaching assistant with David J. Malan's enthusiastic style from Harvard's CS50.

${context ? `Context: ${context.substring(0, 1500)}` : ''}

Student Question: ${message}

Respond enthusiastically with analogies and clear explanations. Keep it concise (2-3 paragraphs max).`;

    return this.generateContent(prompt);
  }

  async generateCourseDescription(videoSummaries, topics, courseName) {
    const prompt = `Create a compelling 2-3 sentence course description for "${courseName}".

Video summaries: ${videoSummaries.substring(0, 2000)}
Key topics: ${topics.slice(0, 10).join(', ')}

Return only the course description, no extra text.`;

    return this.generateContent(prompt);
  }
}

module.exports = new AIService();