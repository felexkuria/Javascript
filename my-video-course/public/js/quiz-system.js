// Interactive Quiz System for Video Learning Platform
class QuizSystem {
  constructor() {
    this.currentQuiz = null;
    this.userAnswers = [];
    this.quizData = this.loadQuizData();
    this.initializeSystem();
  }

  // Load quiz data from localStorage or default
  loadQuizData() {
    const saved = localStorage.getItem('quiz_data');
    return saved ? JSON.parse(saved) : this.getDefaultQuizzes();
  }

  // Default quiz questions for different topics
  getDefaultQuizzes() {
    return {
      'javascript': [
        {
          id: 'js_1',
          question: 'What is the correct way to declare a variable in JavaScript?',
          options: ['var myVar;', 'variable myVar;', 'v myVar;', 'declare myVar;'],
          correct: 0,
          explanation: 'In JavaScript, variables are declared using var, let, or const keywords.'
        },
        {
          id: 'js_2',
          question: 'Which method is used to add an element to the end of an array?',
          options: ['append()', 'push()', 'add()', 'insert()'],
          correct: 1,
          explanation: 'The push() method adds one or more elements to the end of an array.'
        }
      ],
      'react': [
        {
          id: 'react_1',
          question: 'What is JSX?',
          options: ['A JavaScript library', 'A syntax extension for JavaScript', 'A database', 'A CSS framework'],
          correct: 1,
          explanation: 'JSX is a syntax extension for JavaScript that allows you to write HTML-like code in React.'
        }
      ],
      'video_editing': [
        {
          id: 'video_1',
          question: 'What is DaVinci Resolve primarily known for?',
          options: ['Audio editing', 'Color grading and video editing', '3D animation', 'Web development'],
          correct: 1,
          explanation: 'DaVinci Resolve is renowned for its professional color grading capabilities and comprehensive video editing tools.'
        },
        {
          id: 'video_2',
          question: 'Which panel in DaVinci Resolve is used for color correction?',
          options: ['Edit', 'Color', 'Fairlight', 'Deliver'],
          correct: 1,
          explanation: 'The Color panel in DaVinci Resolve is specifically designed for color correction and grading.'
        },
        {
          id: 'video_3',
          question: 'What does the term "timeline" refer to in video editing?',
          options: ['Project duration', 'The sequence where clips are arranged', 'Export settings', 'Audio levels'],
          correct: 1,
          explanation: 'The timeline is where video and audio clips are arranged in sequence to create the final video.'
        }
      ],
      'aws': [
        {
          id: 'aws_1',
          question: 'What does S3 stand for in AWS?',
          options: ['Simple Storage Service', 'Secure Storage System', 'Scalable Storage Solution', 'Standard Storage Service'],
          correct: 0,
          explanation: 'S3 stands for Simple Storage Service, AWS\'s object storage service.'
        },
        {
          id: 'aws_2',
          question: 'Which AWS service is used for serverless computing?',
          options: ['EC2', 'Lambda', 'RDS', 'VPC'],
          correct: 1,
          explanation: 'AWS Lambda is the serverless computing service that runs code without managing servers.'
        }
      ],
      'devops': [
        {
          id: 'devops_1',
          question: 'What does CI/CD stand for?',
          options: ['Continuous Integration/Continuous Deployment', 'Code Integration/Code Deployment', 'Central Integration/Central Deployment', 'Custom Integration/Custom Deployment'],
          correct: 0,
          explanation: 'CI/CD stands for Continuous Integration and Continuous Deployment.'
        },
        {
          id: 'devops_2',
          question: 'Which tool is commonly used for containerization?',
          options: ['Jenkins', 'Docker', 'Ansible', 'Terraform'],
          correct: 1,
          explanation: 'Docker is the most popular containerization platform.'
        }
      ],
      'programming': [
        {
          id: 'prog_1',
          question: 'What is the purpose of version control?',
          options: ['Track changes in code', 'Compile code', 'Debug applications', 'Deploy software'],
          correct: 0,
          explanation: 'Version control systems track changes in code over time and enable collaboration.'
        },
        {
          id: 'prog_2',
          question: 'Which of these is a NoSQL database?',
          options: ['MySQL', 'PostgreSQL', 'MongoDB', 'SQLite'],
          correct: 2,
          explanation: 'MongoDB is a popular NoSQL document database.'
        }
      ],
      'general': [
        {
          id: 'gen_1',
          question: 'What does API stand for?',
          options: ['Application Programming Interface', 'Advanced Programming Interface', 'Application Process Interface', 'Advanced Process Interface'],
          correct: 0,
          explanation: 'API stands for Application Programming Interface, which allows different software applications to communicate.'
        }
      ]
    };
  }

  // Initialize the quiz system
  initializeSystem() {
    this.createQuizModal();
    this.bindEvents();
  }

  // Create quiz modal HTML
  createQuizModal() {
    if (document.getElementById('quiz-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'quiz-modal';
    modal.className = 'quiz-modal';
    modal.innerHTML = `
      <div class="quiz-modal-content">
        <div class="quiz-header">
          <h2 class="quiz-title">📚 Quick Quiz</h2>
          <button class="quiz-close" onclick="quizSystem.closeQuiz()">&times;</button>
        </div>
        <div class="quiz-body">
          <div class="quiz-progress">
            <div class="quiz-progress-bar">
              <div class="quiz-progress-fill" id="quiz-progress"></div>
            </div>
            <span class="quiz-progress-text" id="quiz-progress-text">Question 1 of 5</span>
          </div>
          <div class="quiz-question" id="quiz-question">
            <!-- Question content will be inserted here -->
          </div>
          <div class="quiz-options" id="quiz-options">
            <!-- Options will be inserted here -->
          </div>
          <div class="quiz-explanation" id="quiz-explanation" style="display: none;">
            <!-- Explanation will be shown here -->
          </div>
          <div class="quiz-actions">
            <button class="quiz-btn quiz-btn-secondary" id="quiz-prev" onclick="quizSystem.previousQuestion()" disabled>Previous</button>
            <button class="quiz-btn quiz-btn-primary" id="quiz-next" onclick="quizSystem.nextQuestion()" disabled>Next</button>
            <button class="quiz-btn quiz-btn-success" id="quiz-submit" onclick="quizSystem.submitQuiz()" style="display: none;">Submit Quiz</button>
          </div>
        </div>
        <div class="quiz-results" id="quiz-results" style="display: none;">
          <!-- Results will be shown here -->
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  // Bind events
  bindEvents() {
    // Close modal when clicking outside
    document.addEventListener('click', (e) => {
      const modal = document.getElementById('quiz-modal');
      if (e.target === modal) {
        this.closeQuiz();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (this.currentQuiz && e.key === 'Escape') {
        this.closeQuiz();
      }
    });
  }

  // Start a quiz based on topic
  startQuiz(topic = 'general', customQuestions = null) {
    let questions = customQuestions || this.quizData[topic];
    
    // If no questions found for the topic, try general
    if (!questions || questions.length === 0) {
      console.warn('No questions available for topic:', topic, 'falling back to general');
      questions = this.quizData['general'];
    }
    
    // If still no questions, create a default one
    if (!questions || questions.length === 0) {
      console.warn('No general questions available, creating default');
      questions = [{
        id: 'default_1',
        question: 'What is the most important aspect of learning?',
        options: ['Practice and repetition', 'Reading only', 'Watching videos only', 'Taking notes only'],
        correct: 0,
        explanation: 'Practice and repetition are key to mastering any skill or subject.'
      }];
    }

    this.currentQuiz = {
      topic: topic,
      questions: this.shuffleArray([...questions]).slice(0, 5), // Max 5 questions
      currentIndex: 0,
      userAnswers: [],
      startTime: Date.now(),
      score: 0
    };

    this.showQuiz();
    this.displayQuestion();
  }

  // Show quiz modal
  showQuiz() {
    const modal = document.getElementById('quiz-modal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  // Close quiz modal
  closeQuiz() {
    const modal = document.getElementById('quiz-modal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    this.currentQuiz = null;
  }

  // Display current question
  displayQuestion() {
    if (!this.currentQuiz) return;

    const { questions, currentIndex } = this.currentQuiz;
    const question = questions[currentIndex];

    // Update progress
    const progressPercent = ((currentIndex + 1) / questions.length) * 100;
    document.getElementById('quiz-progress').style.width = `${progressPercent}%`;
    document.getElementById('quiz-progress-text').textContent = `Question ${currentIndex + 1} of ${questions.length}`;

    // Display question
    document.getElementById('quiz-question').innerHTML = `
      <h3>${question.question}</h3>
    `;

    // Display options
    const optionsContainer = document.getElementById('quiz-options');
    optionsContainer.innerHTML = '';

    question.options.forEach((option, index) => {
      const optionElement = document.createElement('div');
      optionElement.className = 'quiz-option';
      optionElement.innerHTML = `
        <input type="radio" id="option_${index}" name="quiz_answer" value="${index}">
        <label for="option_${index}">${option}</label>
      `;
      optionsContainer.appendChild(optionElement);
    });

    // Add click handlers for options
    optionsContainer.addEventListener('change', () => {
      document.getElementById('quiz-next').disabled = false;
      if (currentIndex === questions.length - 1) {
        document.getElementById('quiz-submit').style.display = 'inline-block';
        document.getElementById('quiz-next').style.display = 'none';
      }
    });

    // Update navigation buttons
    document.getElementById('quiz-prev').disabled = currentIndex === 0;
    document.getElementById('quiz-next').disabled = true;
    document.getElementById('quiz-next').style.display = currentIndex === questions.length - 1 ? 'none' : 'inline-block';
    document.getElementById('quiz-submit').style.display = currentIndex === questions.length - 1 ? 'none' : 'none';

    // Hide explanation
    document.getElementById('quiz-explanation').style.display = 'none';
  }

  // Go to next question
  nextQuestion() {
    if (!this.currentQuiz) return;

    // Save current answer
    const selectedOption = document.querySelector('input[name="quiz_answer"]:checked');
    if (selectedOption) {
      this.currentQuiz.userAnswers[this.currentQuiz.currentIndex] = parseInt(selectedOption.value);
    }

    // Move to next question
    if (this.currentQuiz.currentIndex < this.currentQuiz.questions.length - 1) {
      this.currentQuiz.currentIndex++;
      this.displayQuestion();
    }
  }

  // Go to previous question
  previousQuestion() {
    if (!this.currentQuiz) return;

    if (this.currentQuiz.currentIndex > 0) {
      this.currentQuiz.currentIndex--;
      this.displayQuestion();

      // Restore previous answer if exists
      const previousAnswer = this.currentQuiz.userAnswers[this.currentQuiz.currentIndex];
      if (previousAnswer !== undefined) {
        const option = document.getElementById(`option_${previousAnswer}`);
        if (option) {
          option.checked = true;
          document.getElementById('quiz-next').disabled = false;
        }
      }
    }
  }

  // Submit quiz and show results
  submitQuiz() {
    if (!this.currentQuiz) return;

    // Save final answer
    const selectedOption = document.querySelector('input[name="quiz_answer"]:checked');
    if (selectedOption) {
      this.currentQuiz.userAnswers[this.currentQuiz.currentIndex] = parseInt(selectedOption.value);
    }

    // Calculate score
    let score = 0;
    this.currentQuiz.questions.forEach((question, index) => {
      if (this.currentQuiz.userAnswers[index] === question.correct) {
        score++;
      }
    });

    this.currentQuiz.score = score;
    const percentage = Math.round((score / this.currentQuiz.questions.length) * 100);
    const timeTaken = Math.round((Date.now() - this.currentQuiz.startTime) / 1000);

    // Award points based on performance
    let points = 0;
    if (percentage >= 90) points = 50;
    else if (percentage >= 80) points = 40;
    else if (percentage >= 70) points = 30;
    else if (percentage >= 60) points = 20;
    else points = 10;

    // Bonus for speed (under 30 seconds per question)
    const avgTimePerQuestion = timeTaken / this.currentQuiz.questions.length;
    if (avgTimePerQuestion < 30) {
      points += 10;
    }

    // Show results
    this.showResults(score, percentage, timeTaken, points);

    // Award gamification points
    if (window.gamificationSystem) {
      window.gamificationSystem.awardPoints(points, `Quiz: ${percentage}%`);
      
      // Check for quiz-related achievements
      if (percentage === 100) {
        window.gamificationSystem.checkAchievement('perfect_quiz', { perfectScore: true });
      }
    }

    // Save quiz completion
    this.saveQuizCompletion(this.currentQuiz.topic, score, percentage, timeTaken);
  }

  // Show quiz results
  showResults(score, percentage, timeTaken, points) {
    const resultsContainer = document.getElementById('quiz-results');
    const quizBody = document.querySelector('.quiz-body');
    
    quizBody.style.display = 'none';
    resultsContainer.style.display = 'block';

    let performanceMessage = '';
    let performanceClass = '';
    
    if (percentage >= 90) {
      performanceMessage = 'Excellent! 🎉';
      performanceClass = 'excellent';
    } else if (percentage >= 80) {
      performanceMessage = 'Great job! 👏';
      performanceClass = 'great';
    } else if (percentage >= 70) {
      performanceMessage = 'Good work! 👍';
      performanceClass = 'good';
    } else if (percentage >= 60) {
      performanceMessage = 'Not bad! 🙂';
      performanceClass = 'okay';
    } else {
      performanceMessage = 'Keep practicing! 💪';
      performanceClass = 'needs-improvement';
    }

    resultsContainer.innerHTML = `
      <div class="quiz-results-content">
        <div class="quiz-results-header ${performanceClass}">
          <h2>${performanceMessage}</h2>
          <div class="quiz-score-circle">
            <span class="quiz-score-percentage">${percentage}%</span>
            <span class="quiz-score-fraction">${score}/${this.currentQuiz.questions.length}</span>
          </div>
        </div>
        <div class="quiz-results-stats">
          <div class="quiz-stat">
            <span class="quiz-stat-label">Time Taken</span>
            <span class="quiz-stat-value">${timeTaken}s</span>
          </div>
          <div class="quiz-stat">
            <span class="quiz-stat-label">Points Earned</span>
            <span class="quiz-stat-value">+${points}</span>
          </div>
        </div>
        <div class="quiz-results-actions">
          <button class="quiz-btn quiz-btn-primary" onclick="quizSystem.retakeQuiz()">Retake Quiz</button>
          <button class="quiz-btn quiz-btn-secondary" onclick="quizSystem.closeQuiz()">Close</button>
        </div>
      </div>
    `;
  }

  // Retake current quiz
  retakeQuiz() {
    if (this.currentQuiz) {
      const topic = this.currentQuiz.topic;
      this.closeQuiz();
      setTimeout(() => this.startQuiz(topic), 100);
    }
  }

  // Save quiz completion data
  saveQuizCompletion(topic, score, percentage, timeTaken) {
    const completions = JSON.parse(localStorage.getItem('quiz_completions') || '[]');
    completions.push({
      topic,
      score,
      percentage,
      timeTaken,
      date: new Date().toISOString(),
      questions: this.currentQuiz.questions.length
    });
    localStorage.setItem('quiz_completions', JSON.stringify(completions));
  }

  // Utility function to shuffle array
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Get quiz statistics
  getQuizStats() {
    const completions = JSON.parse(localStorage.getItem('quiz_completions') || '[]');
    return {
      totalQuizzes: completions.length,
      averageScore: completions.length > 0 ? 
        Math.round(completions.reduce((sum, c) => sum + c.percentage, 0) / completions.length) : 0,
      bestScore: completions.length > 0 ? 
        Math.max(...completions.map(c => c.percentage)) : 0,
      topicBreakdown: this.getTopicBreakdown(completions)
    };
  }

  // Get breakdown by topic
  getTopicBreakdown(completions) {
    const breakdown = {};
    completions.forEach(completion => {
      if (!breakdown[completion.topic]) {
        breakdown[completion.topic] = {
          count: 0,
          averageScore: 0,
          bestScore: 0
        };
      }
      breakdown[completion.topic].count++;
      breakdown[completion.topic].averageScore = 
        (breakdown[completion.topic].averageScore * (breakdown[completion.topic].count - 1) + completion.percentage) / 
        breakdown[completion.topic].count;
      breakdown[completion.topic].bestScore = Math.max(breakdown[completion.topic].bestScore, completion.percentage);
    });
    return breakdown;
  }
}

// Initialize quiz system when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('Initializing quiz system...');
  try {
    window.quizSystem = new QuizSystem();
    console.log('Quiz system initialized successfully');
  } catch (error) {
    console.error('Failed to initialize quiz system:', error);
  }
});

// Add quiz trigger to video completion
document.addEventListener('videoCompleted', function(event) {
  // Randomly show quiz after video completion (30% chance)
  if (Math.random() < 0.3) {
    setTimeout(() => {
      if (window.quizSystem) {
        window.quizSystem.startQuiz('general');
      }
    }, 2000);
  }
});