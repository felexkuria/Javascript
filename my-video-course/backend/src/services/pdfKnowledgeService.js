const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

class PDFKnowledgeService {
  constructor() {
    this.pdfCache = new Map();
    this.todoCache = new Map();
  }

  // Extract text content from PDF
  async extractPDFContent(pdfPath) {
    try {
      if (this.pdfCache.has(pdfPath)) {
        return this.pdfCache.get(pdfPath);
      }

      const dataBuffer = fs.readFileSync(pdfPath);
      const data = await pdfParse(dataBuffer);
      
      const content = {
        text: data.text,
        pages: data.numpages,
        info: data.info
      };

      this.pdfCache.set(pdfPath, content);
      return content;
    } catch (error) {
      console.error(`Error extracting PDF content from ${pdfPath}:`, error);
      return null;
    }
  }

  // Extract todos from PDF content
  extractTodosFromPDF(pdfContent, pdfName) {
    if (!pdfContent || !pdfContent.text) return [];

    const text = pdfContent.text;
    const todos = [];
    
    // Common todo patterns in DevOps PDFs
    const todoPatterns = [
      /(?:□|☐|▢|\[ \]|\-|\*|\d+\.)\s*(.+?)(?:\n|$)/gi,
      /(?:TODO|To Do|Action Item|Task):\s*(.+?)(?:\n|$)/gi,
      /(?:Install|Setup|Configure|Create|Deploy|Build|Test|Run|Execute|Check|Verify|Practice)\s+(.+?)(?:\n|$)/gi
    ];

    let todoId = 0;
    
    todoPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const todoText = match[1].trim();
        
        // Filter out very short or irrelevant matches
        if (todoText.length > 10 && todoText.length < 200) {
          todos.push({
            id: `pdf_${pdfName}_${todoId++}`,
            text: todoText,
            source: pdfName,
            completed: false,
            priority: this.determinePriority(todoText),
            estimatedTime: this.estimateTime(todoText),
            category: this.categorizeTask(todoText)
          });
        }
      }
    });

    // Remove duplicates
    const uniqueTodos = todos.filter((todo, index, self) => 
      index === self.findIndex(t => t.text.toLowerCase() === todo.text.toLowerCase())
    );

    return uniqueTodos.slice(0, 15); // Limit to 15 todos per PDF
  }

  // Determine task priority based on keywords
  determinePriority(text) {
    const highPriorityKeywords = ['install', 'setup', 'configure', 'create', 'deploy', 'build'];
    const mediumPriorityKeywords = ['test', 'verify', 'check', 'practice', 'run'];
    
    const lowerText = text.toLowerCase();
    
    if (highPriorityKeywords.some(keyword => lowerText.includes(keyword))) {
      return 'high';
    } else if (mediumPriorityKeywords.some(keyword => lowerText.includes(keyword))) {
      return 'medium';
    }
    
    return 'low';
  }

  // Estimate time for task completion
  estimateTime(text) {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('install') || lowerText.includes('setup')) {
      return '15-30 min';
    } else if (lowerText.includes('configure') || lowerText.includes('create')) {
      return '20-45 min';
    } else if (lowerText.includes('practice') || lowerText.includes('test')) {
      return '10-20 min';
    }
    
    return '5-15 min';
  }

  // Categorize tasks
  categorizeTask(text) {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('git')) return 'Git';
    if (lowerText.includes('docker')) return 'Docker';
    if (lowerText.includes('aws') || lowerText.includes('cloud')) return 'AWS/Cloud';
    if (lowerText.includes('kubernetes') || lowerText.includes('k8s')) return 'Kubernetes';
    if (lowerText.includes('jenkins')) return 'Jenkins/CI-CD';
    if (lowerText.includes('terraform')) return 'Terraform';
    if (lowerText.includes('install') || lowerText.includes('setup')) return 'Setup';
    
    return 'General';
  }

  // Get todos for a specific video based on PDF content
  async getTodosForVideo(videoTitle, courseName) {
    try {
      const courseDir = path.join(__dirname, '..', 'public', 'videos', courseName);
      const codeDir = path.join(courseDir, '[TutsNode.com] - DevOps Bootcamp', 'code');
      
      if (!fs.existsSync(codeDir)) {
        return this.getFallbackTodos(videoTitle, courseName);
      }

      const pdfFiles = fs.readdirSync(codeDir)
        .filter(file => file.toLowerCase().endsWith('.pdf'))
        .sort();

      let allTodos = [];
      
      // Find relevant PDFs based on video title
      const relevantPdfs = this.findRelevantPDFs(videoTitle, pdfFiles);
      
      for (const pdfFile of relevantPdfs) {
        const pdfPath = path.join(codeDir, pdfFile);
        const pdfContent = await this.extractPDFContent(pdfPath);
        
        if (pdfContent) {
          const pdfTodos = this.extractTodosFromPDF(pdfContent, pdfFile);
          allTodos = allTodos.concat(pdfTodos);
        }
      }

      // If no relevant PDFs found, use fallback
      if (allTodos.length === 0) {
        return this.getFallbackTodos(videoTitle, courseName);
      }

      // Group todos by category
      const todosByCategory = {};
      allTodos.forEach(todo => {
        if (!todosByCategory[todo.category]) {
          todosByCategory[todo.category] = [];
        }
        todosByCategory[todo.category].push(todo);
      });

      return Object.entries(todosByCategory).map(([category, items]) => ({
        category,
        items: items.slice(0, 8) // Limit items per category
      }));

    } catch (error) {
      console.error('Error getting todos for video:', error);
      return this.getFallbackTodos(videoTitle, courseName);
    }
  }

  // Find PDFs relevant to the video title
  findRelevantPDFs(videoTitle, pdfFiles) {
    const titleLower = videoTitle.toLowerCase();
    const relevantPdfs = [];
    
    // Extract lesson number from video title
    const lessonMatch = videoTitle.match(/lesson\s*(\d+)/i);
    const numberMatch = videoTitle.match(/(\d+)/);
    
    if (lessonMatch || numberMatch) {
      const lessonNumber = lessonMatch ? lessonMatch[1] : numberMatch[1];
      
      // Find PDFs with matching numbers
      const matchingPdfs = pdfFiles.filter(pdf => 
        pdf.includes(lessonNumber) || pdf.includes(`${lessonNumber} -`)
      );
      
      relevantPdfs.push(...matchingPdfs);
    }

    // Find PDFs with matching keywords
    const keywords = ['git', 'docker', 'aws', 'kubernetes', 'jenkins', 'terraform', 'build', 'cloud'];
    keywords.forEach(keyword => {
      if (titleLower.includes(keyword)) {
        const matchingPdfs = pdfFiles.filter(pdf => 
          pdf.toLowerCase().includes(keyword)
        );
        relevantPdfs.push(...matchingPdfs);
      }
    });

    // Remove duplicates and return
    return [...new Set(relevantPdfs)].slice(0, 3); // Limit to 3 PDFs
  }

  // Fallback todos when no PDFs are found
  getFallbackTodos(videoTitle, courseName) {
    const pdfTodoExtractor = require('./pdfTodoExtractor');
    return pdfTodoExtractor.getTodosForVideo(videoTitle, courseName);
  }

  // Extract knowledge for AI chatbot
  async extractKnowledgeForAI(courseName) {
    try {
      const courseDir = path.join(__dirname, '..', 'public', 'videos', courseName);
      const codeDir = path.join(courseDir, '[TutsNode.com] - DevOps Bootcamp', 'code');
      
      if (!fs.existsSync(codeDir)) {
        return '';
      }

      const pdfFiles = fs.readdirSync(codeDir)
        .filter(file => file.toLowerCase().endsWith('.pdf'))
        .slice(0, 5); // Limit to 5 PDFs for performance

      let knowledge = '';
      
      for (const pdfFile of pdfFiles) {
        const pdfPath = path.join(codeDir, pdfFile);
        const pdfContent = await this.extractPDFContent(pdfPath);
        
        if (pdfContent) {
          // Extract key sections from PDF
          const keyContent = this.extractKeyContent(pdfContent.text, pdfFile);
          knowledge += `\n\nFrom ${pdfFile}:\n${keyContent}`;
        }
      }

      return knowledge;
    } catch (error) {
      console.error('Error extracting PDF knowledge:', error);
      return '';
    }
  }

  // Extract key content sections from PDF text
  extractKeyContent(text, pdfName) {
    // Extract important sections (first 500 chars + any bullet points/lists)
    let keyContent = text.substring(0, 500);
    
    // Extract bullet points and numbered lists
    const listItems = text.match(/(?:^|\n)(?:\d+\.|[-*•])\s*(.+?)(?=\n|$)/gm);
    if (listItems && listItems.length > 0) {
      keyContent += '\n\nKey Points:\n' + listItems.slice(0, 10).join('\n');
    }

    return keyContent;
  }

  // Get all PDF knowledge for a course
  async getAllPDFKnowledge(courseName) {
    const cacheKey = `knowledge_${courseName}`;
    
    if (this.pdfCache.has(cacheKey)) {
      return this.pdfCache.get(cacheKey);
    }

    const knowledge = await this.extractKnowledgeForAI(courseName);
    this.pdfCache.set(cacheKey, knowledge);
    
    return knowledge;
  }
}

module.exports = new PDFKnowledgeService();