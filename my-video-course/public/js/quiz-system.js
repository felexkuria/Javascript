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
          question: 'In DaVinci Resolve, which color space is recommended for HDR content delivery?',
          options: ['Rec. 709', 'Rec. 2020', 'sRGB', 'Adobe RGB'],
          correct: 1,
          explanation: 'Rec. 2020 is the standard color space for HDR content, offering wider color gamut than Rec. 709.'
        },
        {
          id: 'video_2',
          question: 'What is the primary difference between primary and secondary color correction?',
          options: ['Primary affects entire image, secondary affects specific areas', 'Primary is for exposure, secondary for saturation', 'Primary uses wheels, secondary uses curves', 'No difference, just different tools'],
          correct: 0,
          explanation: 'Primary color correction affects the entire image globally, while secondary correction targets specific color ranges or areas.'
        },
        {
          id: 'video_3',
          question: 'Which DaVinci Resolve feature allows real-time collaboration between multiple editors?',
          options: ['Proxy Media', 'Collaborative Workflow', 'Project Manager', 'Shared Timeline'],
          correct: 1,
          explanation: 'DaVinci Resolve\'s Collaborative Workflow feature enables multiple users to work on the same project simultaneously.'
        },
        {
          id: 'video_4',
          question: 'What is the recommended bit depth for professional color grading workflows?',
          options: ['8-bit', '10-bit', '12-bit', '16-bit'],
          correct: 2,
          explanation: '12-bit provides sufficient color information for professional grading while maintaining reasonable file sizes.'
        },
        {
          id: 'video_5',
          question: 'In the Fairlight audio page, what does the term "bus" refer to?',
          options: ['Audio input device', 'Signal routing pathway', 'Audio effect', 'Recording format'],
          correct: 1,
          explanation: 'A bus is a signal routing pathway that combines multiple audio sources for processing or output.'
        }
      ],
      'aws': [
        {
          id: 'aws_1',
          question: 'Which S3 storage class provides the lowest cost for long-term archival with retrieval times of 12+ hours?',
          options: ['S3 Standard-IA', 'S3 Glacier', 'S3 Glacier Deep Archive', 'S3 One Zone-IA'],
          correct: 2,
          explanation: 'S3 Glacier Deep Archive offers the lowest cost storage for long-term retention with retrieval times of 12+ hours.'
        },
        {
          id: 'aws_2',
          question: 'What is the maximum execution duration for AWS Lambda functions?',
          options: ['5 minutes', '15 minutes', '30 minutes', '1 hour'],
          correct: 1,
          explanation: 'AWS Lambda functions have a maximum execution duration of 15 minutes (900 seconds).'
        },
        {
          id: 'aws_3',
          question: 'Which AWS service provides a managed NoSQL database with single-digit millisecond latency?',
          options: ['RDS', 'DynamoDB', 'ElastiCache', 'DocumentDB'],
          correct: 1,
          explanation: 'DynamoDB is AWS\'s managed NoSQL database service designed for single-digit millisecond latency at any scale.'
        },
        {
          id: 'aws_4',
          question: 'In AWS VPC, what is the purpose of a NAT Gateway?',
          options: ['Load balancing', 'DNS resolution', 'Outbound internet access for private subnets', 'VPN connectivity'],
          correct: 2,
          explanation: 'NAT Gateway enables instances in private subnets to access the internet for outbound connections while remaining private.'
        }
      ],
      'devops': [
        {
          id: 'devops_1',
          question: 'In Kubernetes, what is the primary purpose of a Service mesh like Istio?',
          options: ['Container orchestration', 'Service-to-service communication and security', 'Image registry management', 'Node scaling'],
          correct: 1,
          explanation: 'Service mesh provides secure service-to-service communication, traffic management, and observability in microservices architectures.'
        },
        {
          id: 'devops_2',
          question: 'Which Docker instruction should be used to minimize image layers and reduce build time?',
          options: ['Multiple RUN commands', 'Single RUN with && operators', 'COPY for each file', 'Multiple FROM statements'],
          correct: 1,
          explanation: 'Combining commands with && in a single RUN instruction reduces layers and optimizes image size and build time.'
        },
        {
          id: 'devops_3',
          question: 'In GitOps, what is the primary principle for deployment management?',
          options: ['Manual deployment approval', 'Git repository as single source of truth', 'Direct kubectl commands', 'SSH-based deployments'],
          correct: 1,
          explanation: 'GitOps uses Git repositories as the single source of truth for declarative infrastructure and application deployment.'
        },
        {
          id: 'devops_4',
          question: 'What is the main advantage of using Terraform over imperative infrastructure tools?',
          options: ['Faster execution', 'Declarative state management', 'Better error handling', 'Simpler syntax'],
          correct: 1,
          explanation: 'Terraform\'s declarative approach manages desired state, automatically determining what changes are needed to reach that state.'
        }
      ],
      'programming': [
        {
          id: 'prog_1',
          question: 'In microservices architecture, what pattern helps prevent cascading failures?',
          options: ['Singleton Pattern', 'Circuit Breaker Pattern', 'Observer Pattern', 'Factory Pattern'],
          correct: 1,
          explanation: 'Circuit Breaker pattern prevents cascading failures by stopping calls to failing services and providing fallback responses.'
        },
        {
          id: 'prog_2',
          question: 'Which database consistency model provides the strongest guarantees?',
          options: ['Eventual Consistency', 'Strong Consistency', 'Weak Consistency', 'Causal Consistency'],
          correct: 1,
          explanation: 'Strong consistency ensures all nodes see the same data simultaneously, providing the strongest consistency guarantees.'
        },
        {
          id: 'prog_3',
          question: 'In REST API design, which HTTP method should be idempotent?',
          options: ['POST', 'PUT', 'PATCH', 'All methods'],
          correct: 1,
          explanation: 'PUT should be idempotent, meaning multiple identical requests should have the same effect as a single request.'
        },
        {
          id: 'prog_4',
          question: 'What is the time complexity of searching in a balanced binary search tree?',
          options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
          correct: 1,
          explanation: 'Balanced BST search has O(log n) time complexity due to the tree\'s height being logarithmic to the number of nodes.'
        }
      ],
      'terraform': [
        {
          id: 'tf_1',
          question: 'What is the primary purpose of Terraform?',
          options: ['Container orchestration', 'Infrastructure as Code', 'Application deployment', 'Database management'],
          correct: 1,
          explanation: 'Terraform is an Infrastructure as Code tool that allows you to define and provision infrastructure using declarative configuration files.'
        },
        {
          id: 'tf_2',
          question: 'Which command initializes a new Terraform working directory?',
          options: ['terraform start', 'terraform init', 'terraform begin', 'terraform create'],
          correct: 1,
          explanation: 'terraform init initializes a working directory containing Terraform configuration files and downloads required providers.'
        },
        {
          id: 'tf_3',
          question: 'What file extension do Terraform configuration files use?',
          options: ['.tf', '.terraform', '.config', '.hcl'],
          correct: 0,
          explanation: 'Terraform configuration files use the .tf extension and are written in HashiCorp Configuration Language (HCL).'
        },
        {
          id: 'tf_4',
          question: 'What is the purpose of the Terraform state file?',
          options: ['Store configuration backups', 'Track resource mappings and metadata', 'Log command history', 'Store provider credentials'],
          correct: 1,
          explanation: 'The state file tracks the mapping between your configuration and real-world resources, storing metadata about your infrastructure.'
        },
        {
          id: 'tf_5',
          question: 'Which Terraform command shows what changes will be made without applying them?',
          options: ['terraform show', 'terraform plan', 'terraform preview', 'terraform check'],
          correct: 1,
          explanation: 'terraform plan creates an execution plan, showing what actions Terraform will take to reach the desired state.'
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
          <h2 class="quiz-title">🎯 Interactive Quiz</h2>
          <button class="quiz-close" onclick="quizSystem.closeQuiz()" title="Close Quiz">✕</button>
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
    let questions = customQuestions;
    
    // If custom questions provided, use them directly
    if (customQuestions && Array.isArray(customQuestions) && customQuestions.length > 0) {
      console.log('Using custom AI-generated questions:', customQuestions.length);
      questions = customQuestions;
    } else {
      // Use predefined questions
      questions = this.quizData[topic];
      
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
    }

    const questionCount = Math.min(questions.length, Math.max(3, Math.floor(questions.length * 0.8)));
    this.currentQuiz = {
      topic: topic,
      questions: customQuestions ? questions : this.shuffleArray([...questions]).slice(0, questionCount),
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
    
    // Pause video if playing
    const video = document.querySelector('video');
    if (video && !video.paused) {
      video.pause();
      this.videoPausedForQuiz = true;
    }
  }

  // Close quiz modal
  closeQuiz() {
    const modal = document.getElementById('quiz-modal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    
    // Resume video if it was paused for quiz
    if (this.videoPausedForQuiz) {
      const video = document.querySelector('video');
      if (video) {
        video.play().catch(() => {});
      }
      this.videoPausedForQuiz = false;
    }
    
    this.currentQuiz = null;
  }

  // Display current question
  displayQuestion() {
    if (!this.currentQuiz) return;

    const { questions, currentIndex } = this.currentQuiz;
    const question = questions[currentIndex];

    // Add fade animation
    const questionEl = document.getElementById('quiz-question');
    const optionsEl = document.getElementById('quiz-options');
    
    questionEl.style.opacity = '0';
    optionsEl.style.opacity = '0';
    
    setTimeout(() => {
      // Update progress with animation
      const progressPercent = ((currentIndex + 1) / questions.length) * 100;
      document.getElementById('quiz-progress').style.width = `${progressPercent}%`;
      document.getElementById('quiz-progress-text').textContent = `Question ${currentIndex + 1} of ${questions.length}`;

      // Display question with animation
      questionEl.innerHTML = `
        <h3>${question.question}</h3>
      `;
      questionEl.style.opacity = '1';
      questionEl.style.transition = 'opacity 0.5s ease';

      // Display options with staggered animation
      const optionsContainer = document.getElementById('quiz-options');
      optionsContainer.innerHTML = '';

      question.options.forEach((option, index) => {
        const optionElement = document.createElement('div');
        optionElement.className = 'quiz-option';
        optionElement.style.opacity = '0';
        optionElement.style.transform = 'translateY(20px)';
        optionElement.innerHTML = `
          <input type="radio" id="option_${index}" name="quiz_answer" value="${index}">
          <label for="option_${index}">${option}</label>
        `;
        optionsContainer.appendChild(optionElement);
        
        // Staggered animation
        setTimeout(() => {
          optionElement.style.opacity = '1';
          optionElement.style.transform = 'translateY(0)';
          optionElement.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        }, index * 100);
      });

      // Add click handlers for options with feedback
      optionsContainer.addEventListener('change', (e) => {
        document.getElementById('quiz-next').disabled = false;
        
        // Add selection feedback
        const selectedOption = e.target.closest('.quiz-option');
        if (selectedOption) {
          selectedOption.style.transform = 'scale(1.02)';
          setTimeout(() => {
            selectedOption.style.transform = 'scale(1)';
          }, 200);
        }
      });

      // Update navigation buttons
      document.getElementById('quiz-prev').disabled = currentIndex === 0;
      document.getElementById('quiz-next').disabled = true;
      document.getElementById('quiz-next').style.display = currentIndex === questions.length - 1 ? 'none' : 'inline-block';
      document.getElementById('quiz-submit').style.display = currentIndex === questions.length - 1 ? 'inline-block' : 'none';

      // Hide explanation
      document.getElementById('quiz-explanation').style.display = 'none';
      
      // Fade in options container
      setTimeout(() => {
        optionsEl.style.opacity = '1';
        optionsEl.style.transition = 'opacity 0.5s ease';
      }, 200);
    }, 100);
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

    // Award gamification points and check achievements
    if (window.gamificationSystem) {
      console.log(`Awarding ${points} points for quiz completion (${percentage}%)`);
      window.gamificationSystem.awardPoints(points, `Quiz: ${percentage}%`);
      
      // Check for quiz-related achievements
      if (percentage === 100) {
        window.gamificationSystem.checkAchievement('perfect_score', { perfectScore: true });
      }
      if (timeTaken < 120) {
        window.gamificationSystem.checkAchievement('speed_learner', { timeTaken });
      }
      window.gamificationSystem.checkAchievement('quiz_master');
      
      // Force sync to ensure points are saved
      window.gamificationSystem.syncWithMongoDB();
      
      // Update UI immediately
      window.gamificationSystem.updateProgressDisplay();
      
      // Update profile display if on profile page
      if (window.location.pathname === '/profile' && window.updateProfileDisplay) {
        setTimeout(() => window.updateProfileDisplay(), 500);
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
          ${percentage < 80 ? '<button class="quiz-btn quiz-btn-warning" onclick="quizSystem.showReview()">Review Mistakes</button>' : ''}
          <button class="quiz-btn quiz-btn-secondary" onclick="quizSystem.closeQuiz()">Close</button>
        </div>
      </div>
    `;
  }

  // Retake current quiz
  retakeQuiz() {
    if (this.currentQuiz) {
      const topic = this.currentQuiz.topic;
      const questions = [...this.currentQuiz.questions];
      
      // Completely restart the quiz
      this.currentQuiz = {
        topic: topic,
        questions: questions,
        currentIndex: 0,
        userAnswers: [],
        startTime: Date.now(),
        score: 0
      };
      
      // Show quiz body and hide results
      const quizBody = document.querySelector('.quiz-body');
      const resultsContainer = document.getElementById('quiz-results');
      quizBody.style.display = 'block';
      resultsContainer.style.display = 'none';
      
      // Display first question
      this.displayQuestion();
    }
  }

  // Save quiz completion data
  saveQuizCompletion(topic, score, percentage, timeTaken) {
    const completion = {
      topic,
      score,
      percentage,
      timeTaken,
      date: new Date().toISOString(),
      questions: this.currentQuiz.questions.length,
      userAnswers: this.currentQuiz.userAnswers,
      correctAnswers: this.currentQuiz.questions.map(q => q.correct)
    };
    
    const completions = JSON.parse(localStorage.getItem('quiz_completions') || '[]');
    completions.push(completion);
    localStorage.setItem('quiz_completions', JSON.stringify(completions));
    
    // Store latest result for this video
    const videoResults = JSON.parse(localStorage.getItem('video_quiz_results') || '{}');
    videoResults[topic] = completion;
    localStorage.setItem('video_quiz_results', JSON.stringify(videoResults));
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
  
  // Show review of incorrect answers
  showReview() {
    const resultsContainer = document.getElementById('quiz-results');
    const incorrectAnswers = [];
    
    this.currentQuiz.questions.forEach((question, index) => {
      const userAnswer = this.currentQuiz.userAnswers[index];
      if (userAnswer !== question.correct) {
        incorrectAnswers.push({
          question: question.question,
          userAnswer: question.options[userAnswer] || 'No answer',
          correctAnswer: question.options[question.correct],
          explanation: question.explanation
        });
      }
    });
    
    let reviewHTML = `
      <div class="quiz-review-content">
        <h2>📚 Review Your Mistakes</h2>
        <div class="review-items">
    `;
    
    incorrectAnswers.forEach((item, index) => {
      reviewHTML += `
        <div class="review-item">
          <h4>Question ${index + 1}:</h4>
          <p class="review-question">${item.question}</p>
          <p class="review-wrong">❌ Your answer: ${item.userAnswer}</p>
          <p class="review-correct">✅ Correct answer: ${item.correctAnswer}</p>
          <p class="review-explanation">💡 ${item.explanation}</p>
        </div>
      `;
    });
    
    reviewHTML += `
        </div>
        <div class="review-actions">
          <button class="quiz-btn quiz-btn-primary" onclick="quizSystem.retakeQuiz()">Retake Quiz</button>
          <button class="quiz-btn quiz-btn-secondary" onclick="quizSystem.closeQuiz()">Close</button>
        </div>
      </div>
    `;
    
    resultsContainer.innerHTML = reviewHTML;
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
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuizSystem);
  } else {
    initQuizSystem();
  }
}

function initQuizSystem() {
  console.log('Initializing quiz system...');
  try {
    window.quizSystem = new QuizSystem();
    console.log('Quiz system initialized successfully');
  } catch (error) {
    console.error('Failed to initialize quiz system:', error);
  }
}

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