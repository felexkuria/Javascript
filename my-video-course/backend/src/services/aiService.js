let GoogleGenerativeAI;
try {
  GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;
} catch (error) {
  console.warn('Google Generative AI not available:', error.message);
}

class AIService {
  constructor() {
    this.genAI = null;
    this.useNova = false;
    
    if (GoogleGenerativeAI && process.env.GEMINI_API_KEY) {
      try {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      } catch (error) {
        console.warn('Failed to initialize Gemini, trying Nova:', error.message);
        this.useNova = true;
      }
    } else if (process.env.NOVA_API_KEY) {
      this.useNova = true;
    }
  }

  async generateQuiz(captionsText, videoTitle) {
    if (this.useNova) {
      return this.generateQuizNova(captionsText, videoTitle);
    }
    
    if (!this.genAI) {
      return { questions: [] };
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      
      const prompt = `Based on this video transcript about "${videoTitle}", generate 5 multiple choice questions with 4 options each. Return as JSON:

Transcript: ${captionsText}

Format:
{
  "questions": [
    {
      "question": "Question text?",
      "options": ["A", "B", "C", "D"],
      "correct": 0,
      "explanation": "Why this is correct"
    }
  ]
}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return { questions: [] };
    } catch (error) {
      console.error('Gemini quiz generation failed, trying Nova:', error);
      return this.generateQuizNova(captionsText, videoTitle);
    }
  }

  async generateSummary(captionsText, videoTitle) {
    if (this.useNova) {
      return this.generateSummaryNova(captionsText, videoTitle);
    }
    
    if (!this.genAI) {
      return 'Summary will be generated when AI service is configured.';
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      
      const prompt = `Create a concise summary of this video about "${videoTitle}":

Transcript: ${captionsText}

Provide a 3-4 sentence summary highlighting the key points and takeaways.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Gemini summary generation failed, trying Nova:', error);
      return this.generateSummaryNova(captionsText, videoTitle);
    }
  }

  async generateTodoList(captionsText, videoTitle) {
    if (this.useNova) {
      return this.generateTodoListNova(captionsText, videoTitle);
    }
    
    if (!this.genAI) {
      return { tasks: [] };
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      
      const prompt = `Based on this video about "${videoTitle}", create actionable tasks for the viewer. Return as JSON:

Transcript: ${captionsText}

Format:
{
  "tasks": [
    {
      "task": "Action item description",
      "priority": "high|medium|low",
      "estimated_time": "5 minutes"
    }
  ]
}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return { tasks: [] };
    } catch (error) {
      console.error('Gemini todo generation failed, trying Nova:', error);
      return this.generateTodoListNova(captionsText, videoTitle);
    }
  }

  // Nova API methods
  async callNovaAPI(prompt) {
    if (!process.env.NOVA_API_KEY) {
      throw new Error('Nova API key not configured');
    }

    const response = await fetch('https://api.nova.ai/v1/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NOVA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt, max_tokens: 1000 })
    });

    if (!response.ok) {
      throw new Error(`Nova API error: ${response.status}`);
    }

    const data = await response.json();
    return data.text || data.content || '';
  }

  async generateQuizNova(captionsText, videoTitle) {
    try {
      const prompt = `Based on this video transcript about "${videoTitle}", generate 5 multiple choice questions with 4 options each. Return as JSON:

Transcript: ${captionsText}

Format:
{
  "questions": [
    {
      "question": "Question text?",
      "options": ["A", "B", "C", "D"],
      "correct": 0,
      "explanation": "Why this is correct"
    }
  ]
}`;

      const text = await this.callNovaAPI(prompt);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { questions: [] };
    } catch (error) {
      console.error('Nova quiz generation failed:', error);
      return { questions: [] };
    }
  }

  async generateSummaryNova(captionsText, videoTitle) {
    try {
      const prompt = `Create a concise summary of this video about "${videoTitle}":

Transcript: ${captionsText}

Provide a 3-4 sentence summary highlighting the key points and takeaways.`;
      
      return await this.callNovaAPI(prompt);
    } catch (error) {
      console.error('Nova summary generation failed:', error);
      return 'Summary generation failed. Please try again later.';
    }
  }

  async generateTodoListNova(captionsText, videoTitle) {
    try {
      const prompt = `Based on this video about "${videoTitle}", create actionable tasks for the viewer. Return as JSON:

Transcript: ${captionsText}

Format:
{
  "tasks": [
    {
      "task": "Action item description",
      "priority": "high|medium|low",
      "estimated_time": "5 minutes"
    }
  ]
}`;

      const text = await this.callNovaAPI(prompt);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { tasks: [] };
    } catch (error) {
      console.error('Nova todo generation failed:', error);
      return { tasks: [] };
    }
  }
}

module.exports = new AIService();