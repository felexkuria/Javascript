const fs = require('fs');
const path = require('path');
const aiService = require('./aiService');

class AITodoExtractor {
  constructor() {
    this.cache = new Map();
  }

  // Extract todos from SRT content using AI
  async extractTodosFromSRT(srtContent, videoTitle) {
    try {
      const response = await aiService.generateTodos(srtContent, 'video', videoTitle);
      
      // Clean up response and parse JSON
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const todos = JSON.parse(jsonMatch[0]);
        return todos.map((todo, index) => ({
          ...todo,
          id: `srt_${videoTitle}_${index}`,
          source: 'video'
        }));
      }
      
      return [];
    } catch (error) {
      console.error('AI SRT todo extraction failed:', error.message);
      return this.getFallbackSRTTodos(videoTitle);
    }
  }

  // Extract todos from PDF content using AI
  async extractTodosFromPDF(pdfContent, pdfName) {
    try {
      const response = await aiService.generateTodos(pdfContent, 'pdf', pdfName);
      
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const todos = JSON.parse(jsonMatch[0]);
        return todos.map((todo, index) => ({
          ...todo,
          id: `pdf_${pdfName}_${index}`,
          source: 'pdf'
        }));
      }
      
      return [];
    } catch (error) {
      console.error('AI PDF todo extraction failed:', error.message);
      return [];
    }
  }

  // Get comprehensive todos for a video using both SRT and PDF
  async getTodosForVideo(videoTitle, courseName) {
    const cacheKey = `${courseName}_${videoTitle}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    let allTodos = [];

    // 1. Extract from SRT if available
    const srtTodos = await this.extractFromSRT(videoTitle, courseName);
    allTodos = allTodos.concat(srtTodos);

    // 2. Extract from relevant PDFs
    const pdfTodos = await this.extractFromPDFs(videoTitle, courseName);
    allTodos = allTodos.concat(pdfTodos);

    // 3. Group by category
    const todosByCategory = this.groupTodosByCategory(allTodos);
    
    // Cache result
    this.cache.set(cacheKey, todosByCategory);
    
    return todosByCategory;
  }

  // Extract todos from SRT file
  async extractFromSRT(videoTitle, courseName) {
    try {
      const videoDir = path.join(__dirname, '..', 'public', 'videos');
      let srtPath = null;

      // Find SRT file across all course directories
      const courseFolders = fs.readdirSync(videoDir).filter(folder => 
        fs.statSync(path.join(videoDir, folder)).isDirectory()
      );

      for (const courseFolder of courseFolders) {
        const findSrt = (dir) => {
          if (!fs.existsSync(dir)) return null;
          const files = fs.readdirSync(dir);
          for (const file of files) {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) {
              const result = findSrt(filePath);
              if (result) return result;
            } else if (file === `${videoTitle}.srt`) {
              return filePath;
            }
          }
          return null;
        };

        srtPath = findSrt(path.join(videoDir, courseFolder));
        if (srtPath) break;
      }

      if (srtPath && fs.existsSync(srtPath)) {
        const srtContent = fs.readFileSync(srtPath, 'utf8');
        const srtText = this.parseSRTToText(srtContent);
        return await this.extractTodosFromSRT(srtText, videoTitle);
      }

      return [];
    } catch (error) {
      console.error('Error extracting from SRT:', error);
      return [];
    }
  }

  // Extract todos from relevant PDFs
  async extractFromPDFs(videoTitle, courseName) {
    try {
      const pdfKnowledgeService = require('./pdfKnowledgeService');
      const courseDir = path.join(__dirname, '..', 'public', 'videos', courseName);
      const codeDir = path.join(courseDir, '[TutsNode.com] - DevOps Bootcamp', 'code');
      
      if (!fs.existsSync(codeDir)) return [];

      const pdfFiles = fs.readdirSync(codeDir)
        .filter(file => file.toLowerCase().endsWith('.pdf'))
        .slice(0, 2); // Limit to 2 PDFs for performance

      let pdfTodos = [];
      
      for (const pdfFile of pdfFiles) {
        const pdfPath = path.join(codeDir, pdfFile);
        const pdfContent = await pdfKnowledgeService.extractPDFContent(pdfPath);
        
        if (pdfContent && pdfContent.text) {
          const todos = await this.extractTodosFromPDF(pdfContent.text, pdfFile);
          pdfTodos = pdfTodos.concat(todos);
        }
      }

      return pdfTodos;
    } catch (error) {
      console.error('Error extracting from PDFs:', error);
      return [];
    }
  }

  // Parse SRT content to plain text
  parseSRTToText(srtContent) {
    const lines = srtContent.split('\n');
    let text = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip sequence numbers and timestamps
      if (!/^\d+$/.test(line) && !line.includes('-->') && line.length > 0) {
        text += line + ' ';
      }
    }
    
    return text.trim();
  }

  // Group todos by category
  groupTodosByCategory(todos) {
    const categories = {};
    
    todos.forEach(todo => {
      const category = todo.category || 'General';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(todo);
    });

    return Object.entries(categories).map(([category, items]) => ({
      category,
      items: items.slice(0, 6) // Limit items per category
    }));
  }

  // Fallback SRT todos when AI fails
  getFallbackSRTTodos(videoTitle) {
    const lessonMatch = videoTitle.match(/lesson\s*(\d+)/i);
    const lessonNum = lessonMatch ? lessonMatch[1] : '1';
    
    return [
      {
        id: `fallback_${videoTitle}_1`,
        text: `Practice the concepts covered in ${videoTitle}`,
        category: 'Practice',
        priority: 'medium',
        estimatedTime: '15-20 min',
        source: 'video'
      },
      {
        id: `fallback_${videoTitle}_2`,
        text: `Set up the environment for lesson ${lessonNum}`,
        category: 'Setup',
        priority: 'high',
        estimatedTime: '10-15 min',
        source: 'video'
      }
    ];
  }
}

module.exports = new AITodoExtractor();