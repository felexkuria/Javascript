const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class SRTQuizGenerator {
  // Generate SRT file using ffmpeg if it doesn't exist
  async generateSRT(videoPath) {
    const videoDir = path.dirname(videoPath);
    const videoName = path.basename(videoPath, path.extname(videoPath));
    const srtPath = path.join(videoDir, `${videoName}.srt`);
    
    if (fs.existsSync(srtPath)) {
      return srtPath;
    }
    
    console.log(`Generating SRT for ${videoPath}`);
    
    return new Promise((resolve, reject) => {
      const ffmpegProcess = spawn('ffmpeg', [
        '-i', videoPath,
        '-vn', '-an',
        '-c:s', 'srt',
        srtPath
      ]);
      
      ffmpegProcess.on('close', (code) => {
        if (code === 0 && fs.existsSync(srtPath)) {
          resolve(srtPath);
        } else {
          // Fallback to Whisper
          this.generateWithWhisper(videoPath).then(resolve).catch(reject);
        }
      });
      
      ffmpegProcess.on('error', () => {
        this.generateWithWhisper(videoPath).then(resolve).catch(reject);
      });
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
      
      whisperProcess.on('close', (code) => {
        if (code === 0) {
          const whisperOutput = path.join(videoDir, `${path.basename(videoPath, path.extname(videoPath))}.srt`);
          if (fs.existsSync(whisperOutput) && whisperOutput !== srtPath) {
            fs.renameSync(whisperOutput, srtPath);
          }
          resolve(srtPath);
        } else {
          reject(new Error('Whisper failed'));
        }
      });
      
      whisperProcess.on('error', reject);
    });
  }
  
  // Parse SRT content
  parseSRT(srtPath) {
    if (!fs.existsSync(srtPath)) return '';
    
    const content = fs.readFileSync(srtPath, 'utf8');
    return content.replace(/\d+\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\n/g, ' ')
                 .replace(/\n+/g, ' ')
                 .trim();
  }
  
  // Generate quiz questions from SRT content
  generateQuestions(srtContent, videoTitle) {
    const sentences = srtContent.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const questions = [];
    
    // Generate different types of questions
    const questionTypes = [
      this.generateFillInBlank,
      this.generateMultipleChoice,
      this.generateTrueFalse
    ];
    
    for (let i = 0; i < Math.min(5, sentences.length); i++) {
      const sentence = sentences[i].trim();
      if (sentence.length > 30) {
        const questionType = questionTypes[i % questionTypes.length];
        const question = questionType.call(this, sentence, videoTitle);
        if (question) questions.push(question);
      }
    }
    
    return questions.slice(0, 3); // Return max 3 questions
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
    return {
      id: `mc_${Date.now()}_${Math.random()}`,
      question: `According to the video, what was mentioned about "${concept}"?`,
      options: [
        sentence.substring(0, 50) + '...',
        'This was not discussed in the video',
        'The opposite was mentioned',
        'This topic was briefly touched upon'
      ],
      correct: 0,
      explanation: `This information was directly mentioned in the video content.`
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
  
  // Generate wrong answer
  generateWrongAnswer(correctWord) {
    const alternatives = [
      correctWord + 's',
      'not ' + correctWord,
      correctWord.substring(0, -1),
      correctWord.replace(/[aeiou]/g, 'x')
    ];
    return alternatives[Math.floor(Math.random() * alternatives.length)];
  }
}

module.exports = new SRTQuizGenerator();