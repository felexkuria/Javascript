const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI('AIzaSyAT7kcq2iej1djqwuDNetyLexUVL9ear68');

class SRTQuizGenerator {
  // Generate SRT file using ffmpeg if it doesn't exist
  async generateSRT(videoPath) {
    const videoDir = path.dirname(videoPath);
    const videoName = path.basename(videoPath, path.extname(videoPath));
    const srtPath = path.join(videoDir, `${videoName}.srt`);
    
    // Check if SRT already exists
    if (fs.existsSync(srtPath)) {
      console.log(`Found existing SRT: ${srtPath}`);
      return srtPath;
    }
    
    // Also check for SRT files in the same directory with similar names
    try {
      const files = fs.readdirSync(videoDir);
      const srtFiles = files.filter(file => file.endsWith('.srt'));
      if (srtFiles.length > 0) {
        const matchingSrt = path.join(videoDir, srtFiles[0]);
        console.log(`Found existing SRT file: ${matchingSrt}`);
        return matchingSrt;
      }
    } catch (error) {
      console.warn('Error checking for existing SRT files:', error.message);
    }
    
    console.log(`Generating SRT for ${videoPath}`);
    
    return new Promise((resolve, reject) => {
      // Try extracting existing subtitles first
      const ffmpegProcess = spawn('ffmpeg', [
        '-i', videoPath,
        '-map', '0:s:0?',
        '-c:s', 'srt',
        srtPath
      ]);
      
      let hasOutput = false;
      
      ffmpegProcess.on('close', (code) => {
        if (fs.existsSync(srtPath) && fs.statSync(srtPath).size > 0) {
          resolve(srtPath);
        } else {
          // Fallback to Whisper
          this.generateWithWhisper(videoPath).then(resolve).catch(reject);
        }
      });
      
      ffmpegProcess.on('error', () => {
        this.generateWithWhisper(videoPath).then(resolve).catch(reject);
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        ffmpegProcess.kill();
        this.generateWithWhisper(videoPath).then(resolve).catch(reject);
      }, 30000);
    });
  }
  
  // Generate SRT using Whisper
  async generateWithWhisper(videoPath) {
    const videoDir = path.dirname(videoPath);
    const videoName = path.basename(videoPath, path.extname(videoPath));
    const srtPath = path.join(videoDir, `${videoName}.srt`);
    
    return new Promise((resolve, reject) => {
      const whisperProcess = spawn('whisper', [
        videoPath,
        '--model', 'base',
        '--output_format', 'srt',
        '--output_dir', videoDir,
        '--verbose', 'False'
      ]);
      
      let errorOutput = '';
      
      whisperProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      whisperProcess.on('close', (code) => {
        if (code === 0) {
          const whisperOutput = path.join(videoDir, `${path.basename(videoPath, path.extname(videoPath))}.srt`);
          if (fs.existsSync(whisperOutput) && whisperOutput !== srtPath) {
            fs.renameSync(whisperOutput, srtPath);
          }
          if (fs.existsSync(srtPath)) {
            resolve(srtPath);
          } else {
            reject(new Error('Whisper output not found'));
          }
        } else {
          reject(new Error(`Whisper failed: ${errorOutput}`));
        }
      });
      
      whisperProcess.on('error', (err) => {
        reject(new Error(`Whisper process error: ${err.message}`));
      });
      
      // Timeout after 5 minutes
      setTimeout(() => {
        whisperProcess.kill();
        reject(new Error('Whisper timeout'));
      }, 300000);
    });
  }
  
  // Parse SRT content with timestamps
  parseSRT(srtPath) {
    if (!fs.existsSync(srtPath)) return [];
    
    const content = fs.readFileSync(srtPath, 'utf8');
    const entries = content.split(/\n\s*\n/).filter(entry => entry.trim());
    
    return entries.map(entry => {
      const lines = entry.trim().split('\n');
      if (lines.length >= 3) {
        const timestamp = lines[1];
        const text = lines.slice(2).join(' ').trim();
        return { timestamp, text };
      }
      return null;
    }).filter(entry => entry && entry.text.length > 10);
  }
  
  // Generate quiz questions from SRT entries using AI
  async generateQuestions(srtEntries, videoTitle) {
    if (!Array.isArray(srtEntries) || srtEntries.length === 0) return [];
    
    try {
      return await this.generateAIQuestions(srtEntries, videoTitle);
    } catch (error) {
      console.error('AI generation failed:', error.message);
      throw error; // Don't fall back to old questions
    }
  }
  
  // Generate questions using Google Gemini AI
  async generateAIQuestions(srtEntries, videoTitle) {
    // Check if quiz already exists in MongoDB
    try {
      const existingQuiz = await this.getStoredQuiz(videoTitle);
      if (existingQuiz) {
        console.log('Using cached quiz for:', videoTitle);
        return existingQuiz.questions;
      }
    } catch (error) {
      console.warn('Failed to check existing quiz:', error.message);
    }
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const content = srtEntries.slice(0, 15).map(e => e.text).join(' ').substring(0, 3000);
    
    const prompt = `You are a teacher creating quiz questions for active recall learning. Based on this video content, create 5 practical questions that test student understanding.

Video: "${videoTitle}"
Content: "${content}"

Create questions that:
- Test key concepts from the video
- Use active recall method
- Are specific to this video's content
- Have realistic wrong answers

Return ONLY this JSON format:
[{
  "question": "What specific technique was demonstrated?",
  "options": ["Correct from video", "Plausible wrong", "Another wrong", "Third wrong"],
  "correct": 0,
  "explanation": "Brief explanation"
}]`;
    
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    
    const jsonMatch = response.match(/\[.*\]/s);
    if (!jsonMatch) throw new Error('No JSON found in response');
    
    const questions = JSON.parse(jsonMatch[0]);
    const finalQuestions = questions.map((q, i) => ({ ...q, id: `ai_${this.hashString(videoTitle)}_${i}` }));
    
    // Store quiz in MongoDB
    try {
      await this.storeQuiz(videoTitle, finalQuestions);
    } catch (error) {
      console.warn('Failed to store quiz:', error.message);
    }
    
    return finalQuestions;
  }
  
  // Store quiz in localStorage and sync with MongoDB
  storeQuiz(videoTitle, questions) {
    const quizData = JSON.parse(localStorage.getItem('video_quizzes') || '{}');
    const quizEntry = {
      questions,
      createdAt: new Date().toISOString()
    };
    quizData[videoTitle] = quizEntry;
    localStorage.setItem('video_quizzes', JSON.stringify(quizData));
    
    // Sync with MongoDB
    this.syncQuizToMongoDB(videoTitle, quizEntry);
  }
  
  // Sync quiz to MongoDB
  async syncQuizToMongoDB(videoTitle, quizEntry) {
    try {
      await fetch('/api/quiz/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoTitle, ...quizEntry })
      });
    } catch (error) {
      console.warn('Failed to sync quiz to MongoDB:', error);
    }
  }
  
  // Get stored quiz from localStorage or MongoDB
  async getStoredQuiz(videoTitle) {
    // Check localStorage first
    const quizData = JSON.parse(localStorage.getItem('video_quizzes') || '{}');
    if (quizData[videoTitle]) {
      return quizData[videoTitle];
    }
    
    // Fallback to MongoDB
    try {
      const response = await fetch(`/api/quiz/get/${encodeURIComponent(videoTitle)}`);
      if (response.ok) {
        const quiz = await response.json();
        if (quiz) {
          // Store in localStorage for future use
          quizData[videoTitle] = quiz;
          localStorage.setItem('video_quizzes', JSON.stringify(quizData));
          return quiz;
        }
      }
    } catch (error) {
      console.warn('Failed to fetch quiz from MongoDB:', error);
    }
    
    return null;
  }
  
  // Fallback to hash-based questions
  generateFallbackQuestions(srtEntries, videoTitle) {
    const questions = [];
    const videoHash = this.hashString(videoTitle);
    
    const meaningfulEntries = srtEntries.filter(entry => 
      entry.text.length > 30 && 
      !entry.text.match(/^[\[\(].*[\]\)]$/) && 
      entry.text.split(' ').length > 5
    );
    
    const selectedEntries = this.selectUniqueEntries(meaningfulEntries, videoHash, 5);
    
    selectedEntries.forEach((entry, index) => {
      const questionTypes = [
        this.generateTimestampQuestion,
        this.generateContentQuestion,
        this.generateSequenceQuestion
      ];
      
      const questionType = questionTypes[index % questionTypes.length];
      const question = questionType.call(this, entry, videoTitle, index, videoHash);
      if (question) questions.push(question);
    });
    
    return questions;
  }
  
  // Generate fill-in-the-blank question
  generateFillInBlank(sentence, videoTitle) {
    const words = sentence.split(' ');
    if (words.length < 5) return null;
    
    const keyWordIndex = Math.floor(words.length / 2);
    const keyWord = words[keyWordIndex];
    const questionText = words.map((word, index) => 
      index === keyWordIndex ? '______' : word
    ).join(' ');
    
    return {
      id: `fill_${Date.now()}_${Math.random()}`,
      question: `Complete the sentence: "${questionText}"`,
      options: [keyWord, this.generateWrongAnswer(keyWord), this.generateWrongAnswer(keyWord), this.generateWrongAnswer(keyWord)],
      correct: 0,
      explanation: `The correct word is "${keyWord}" from the video content.`
    };
  }
  
  // Generate multiple choice question
  generateMultipleChoice(sentence, videoTitle) {
    const concepts = this.extractConcepts(sentence);
    if (concepts.length === 0) return null;
    
    const concept = concepts[0];
    const actualContent = sentence.trim();
    const wrongOptions = [
      'This was not discussed in the video',
      'The opposite was mentioned', 
      'This topic was briefly touched upon'
    ];
    
    return {
      id: `srt_mc_${Date.now()}`,
      question: `According to the video, what was mentioned about "${concept}"?`,
      options: [
        actualContent.length > 80 ? actualContent.substring(0, 77) + '...' : actualContent,
        ...wrongOptions
      ],
      correct: 0,
      explanation: `The video specifically mentioned: "${actualContent}"`
    };
  }
  
  // Generate true/false question
  generateTrueFalse(sentence, videoTitle) {
    return {
      id: `tf_${Date.now()}_${Math.random()}`,
      question: `True or False: The video mentioned "${sentence.substring(0, 60)}..."`,
      options: ['True', 'False'],
      correct: 0,
      explanation: 'This statement was mentioned in the video content.'
    };
  }
  
  // Extract key concepts from sentence
  extractConcepts(sentence) {
    const words = sentence.toLowerCase().split(' ');
    const concepts = words.filter(word => 
      word.length > 4 && 
      !['this', 'that', 'with', 'from', 'they', 'have', 'will', 'been', 'were'].includes(word)
    );
    return concepts.slice(0, 3);
  }
  
  // Generate timestamp-based question
  generateTimestampQuestion(entry, videoTitle, index, videoHash) {
    const timeMatch = entry.timestamp.match(/\d{2}:\d{2}:\d{2},\d{3}/);
    if (!timeMatch) return null;
    
    const timestamp = timeMatch[0].replace(',', '.');
    const uniqueId = `srt_time_${videoHash}_${index}`;
    
    return {
      id: uniqueId,
      question: `According to the video, what was mentioned around "${timestamp}"?`,
      options: [
        entry.text,
        'This was not discussed in the video',
        'The opposite was mentioned',
        'This topic was briefly touched upon'
      ],
      correct: 0,
      explanation: `At ${timestamp}, the video specifically mentioned: "${entry.text}"`
    };
  }
  
  // Generate content-based question
  generateContentQuestion(entry, videoTitle, index, videoHash) {
    const keyPhrase = this.extractKeyPhrase(entry.text);
    if (!keyPhrase) return null;
    
    const uniqueId = `srt_content_${videoHash}_${index}`;
    
    return {
      id: uniqueId,
      question: `What did the video say about "${keyPhrase}"?`,
      options: [
        entry.text,
        'This concept was not covered',
        'The video mentioned the opposite',
        'This was only briefly mentioned'
      ],
      correct: 0,
      explanation: `The video explained: "${entry.text}"`
    };
  }
  
  // Generate sequence question
  generateSequenceQuestion(entry, videoTitle, index, videoHash) {
    const uniqueId = `srt_sequence_${videoHash}_${index}`;
    
    return {
      id: uniqueId,
      question: `True or False: The video stated "${entry.text.substring(0, 60)}..."`,
      options: ['True', 'False'],
      correct: 0,
      explanation: `This statement was directly mentioned in the video.`
    };
  }
  
  // Extract key phrase from text
  extractKeyPhrase(text) {
    const words = text.split(' ');
    const meaningfulWords = words.filter(word => 
      word.length > 3 && 
      !['this', 'that', 'with', 'from', 'they', 'have', 'will', 'been', 'were', 'when', 'what', 'where'].includes(word.toLowerCase())
    );
    return meaningfulWords.slice(0, 2).join(' ');
  }
  
  // Hash string to create consistent unique identifiers
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
  
  // Select unique entries based on video hash
  selectUniqueEntries(entries, videoHash, count) {
    if (entries.length <= count) return entries;
    
    const hashNum = parseInt(videoHash, 36);
    const selected = [];
    const step = Math.floor(entries.length / count);
    
    for (let i = 0; i < count; i++) {
      const index = (hashNum + i * step) % entries.length;
      if (!selected.find(entry => entry.text === entries[index].text)) {
        selected.push(entries[index]);
      }
    }
    
    while (selected.length < count && selected.length < entries.length) {
      for (const entry of entries) {
        if (!selected.find(sel => sel.text === entry.text)) {
          selected.push(entry);
          if (selected.length >= count) break;
        }
      }
      break;
    }
    
    return selected;
  }
}

module.exports = new SRTQuizGenerator();