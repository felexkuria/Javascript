const aiService = require('../services/aiService');
const srtQuizGenerator = require('../services/srtQuizGenerator');
const aiTodoExtractor = require('../services/aiTodoExtractor');
const videoService = require('../services/videoService');
const path = require('path');
const fs = require('fs');

class AIController {
  async generateQuiz(req, res) {
    try {
      const courseName = decodeURIComponent(req.params.courseName);
      const videoId = req.params.videoId;

      const video = await videoService.getVideoById(courseName, videoId);
      if (!video) {
        return res.status(404).json({ error: 'Video not found' });
      }

      let questions = [];

      if (video.videoUrl && !video.isYouTube) {
        const videoPath = path.join(__dirname, '../../../frontend/public/videos', video.videoUrl);
        if (fs.existsSync(videoPath)) {
          try {
            const srtPath = await srtQuizGenerator.generateSRT(videoPath);
            const srtEntries = srtQuizGenerator.parseSRT(srtPath);

            if (srtEntries && srtEntries.length > 3) {
              questions = await srtQuizGenerator.generateQuestions(srtEntries, video.title);
            }
          } catch (srtError) {
            console.warn('SRT quiz generation failed:', srtError.message);
          }
        }
      }

      if (questions.length === 0) {
        return res.json({ questions: [], videoTitle: video.title, quizType: 'none' });
      }

      res.json({
        questions,
        videoTitle: video.title,
        quizType: 'ai'
      });
    } catch (error) {
      console.error('Error generating quiz:', error);
      res.status(500).json({ error: 'Failed to generate quiz' });
    }
  }

  async getVideoSummary(req, res) {
    try {
      const videoName = decodeURIComponent(req.params.videoName);
      const summaryPath = path.join(__dirname, '../../../data/video_summaries.json');

      if (fs.existsSync(summaryPath)) {
        const summaries = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
        if (summaries[videoName]) {
          return res.json(summaries[videoName]);
        }
      }

      res.json({ summary: null, keyTopics: [] });
    } catch (error) {
      console.error('Error getting video summary:', error);
      res.status(500).json({ error: 'Failed to get video summary' });
    }
  }

  async getVideoTodos(req, res) {
    try {
      const courseName = decodeURIComponent(req.params.courseName);
      const videoTitle = decodeURIComponent(req.params.videoTitle);

      let todos;
      try {
        todos = await aiTodoExtractor.getTodosForVideo(videoTitle, courseName);
      } catch (aiError) {
        console.warn('AI todo extraction failed:', aiError.message);
        todos = [];
      }

      res.json({ todos, videoTitle, courseName, source: 'ai-powered' });
    } catch (error) {
      console.error('Error getting video todos:', error);
      res.status(500).json({ error: 'Failed to get video todos' });
    }
  }

  async generateTodos(req, res) {
    try {
      const { videoTitle, courseName } = req.body;

      if (!videoTitle || !courseName) {
        return res.status(400).json({ error: 'Missing videoTitle or courseName' });
      }

      const cacheKey = `${courseName}_${videoTitle}`;
      if (aiTodoExtractor.cache.has(cacheKey)) {
        aiTodoExtractor.cache.delete(cacheKey);
      }

      const todos = await aiTodoExtractor.getTodosForVideo(videoTitle, courseName);

      res.json({
        success: true,
        todos,
        message: 'AI todos generated successfully',
        source: 'ai-fresh'
      });
    } catch (error) {
      console.error('Error generating AI todos:', error);
      res.status(500).json({ error: 'Failed to generate AI todos' });
    }
  }

  async updateTodo(req, res) {
    try {
      const { videoTitle, courseName, todoId, completed } = req.body;

      const todoDataPath = path.join(__dirname, '../../../data/todo_progress.json');
      const dataDir = path.join(__dirname, '../../../data');

      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      let todoProgress = {};
      if (fs.existsSync(todoDataPath)) {
        todoProgress = JSON.parse(fs.readFileSync(todoDataPath, 'utf8'));
      }

      const key = `${courseName}_${videoTitle}`;
      if (!todoProgress[key]) {
        todoProgress[key] = {};
      }

      todoProgress[key][todoId] = {
        completed,
        completedAt: completed ? new Date().toISOString() : null
      };

      fs.writeFileSync(todoDataPath, JSON.stringify(todoProgress, null, 2));

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating todo:', error);
      res.status(500).json({ error: 'Failed to update todo' });
    }
  }

  async getTodoProgress(req, res) {
    try {
      const courseName = decodeURIComponent(req.params.courseName);
      const videoTitle = decodeURIComponent(req.params.videoTitle);

      const todoDataPath = path.join(__dirname, '../../../data/todo_progress.json');

      if (!fs.existsSync(todoDataPath)) {
        return res.json({ progress: {} });
      }

      const todoProgress = JSON.parse(fs.readFileSync(todoDataPath, 'utf8'));
      const key = `${courseName}_${videoTitle}`;

      res.json({ progress: todoProgress[key] || {} });
    } catch (error) {
      console.error('Error getting todo progress:', error);
      res.status(500).json({ error: 'Failed to get todo progress' });
    }
  }

  async checkAIStatus(req, res) {
    try {
      const testPrompt = 'Test AI service availability';
      await aiService.generateContent(testPrompt);
      res.json({ status: 'available', service: 'AI service operational' });
    } catch (error) {
      res.json({ status: 'unavailable', error: error.message });
    }
  }

  async generateContent(req, res) {
    try {
      const { prompt, ...options } = req.body;
      const result = await aiService.generateContent(prompt, options);
      res.json({ success: true, content: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async chatbot(req, res) {
    try {
      const { message, courseName, videoTitle } = req.body;

      if (!message || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message is required' });
      }

      try {
        const context = courseName ? `Course: ${courseName}${videoTitle ? `, Video: ${videoTitle}` : ''}` : '';
        const aiResponse = await aiService.generateChatResponse(message, context);
        res.json({ 
          response: aiResponse,
          aiModel: 'Amazon Nova Pro'
        });
      } catch (aiError) {
        console.warn('AI service failed:', aiError.message);
        const offlineResponse = this.getOfflineResponse(message, courseName, videoTitle);
        res.json({ 
          response: offlineResponse,
          aiModel: 'Offline Assistant'
        });
      }
    } catch (error) {
      console.error('Chatbot error:', error);
      const fallbackResponse = this.getOfflineResponse(req.body.message, req.body.courseName, req.body.videoTitle);
      res.json({ response: fallbackResponse });
    }
  }

  getOfflineResponse(message, courseName, videoTitle) {
    const msg = message.toLowerCase();

    if (msg.includes('terraform')) {
      return "Indeed! Terraform is fantastic for Infrastructure as Code! Think of it as writing a blueprint for your entire cloud setup. The beauty is in the declarative approach - you describe what you want, and Terraform figures out how to get there. Start with 'terraform init', 'terraform plan', and 'terraform apply'. Remember, always version control your .tf files! 🏗️";
    }

    if (msg.includes('aws') || msg.includes('cloud')) {
      return "Excellent question about AWS! The cloud is like having a massive data center at your fingertips. With Terraform, you can provision AWS resources declaratively. Start with simple resources like S3 buckets and EC2 instances, then work your way up to complex architectures. Always follow the principle of least privilege! ☁️";
    }

    return `That's a thoughtful question about ${videoTitle || 'this topic'}! While I'm running in offline mode right now, I encourage you to break down the problem step by step.\n\nIn ${courseName?.includes('Terraform') ? 'Terraform and Infrastructure as Code' : 'DevOps'}, we always start with the fundamentals and build up. Don't be afraid to experiment in a safe environment - that's how we learn best!\n\nKeep exploring and asking great questions like this one! 🚀`;
  }
}

module.exports = new AIController();