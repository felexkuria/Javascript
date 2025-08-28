const aiService = require('./aiService');

class ExamTopicsQuizGenerator {
  async generatePracticeExam(courseName, completedVideos) {
    const courseType = this.detectCourseType(courseName);
    const questionCount = 65;
    
    const prompt = this.buildExamPrompt(courseType, completedVideos, questionCount);
    
    try {
      const response = await aiService.generateContent(prompt);
      const questions = this.parseQuestions(response);
      return questions.slice(0, questionCount);
    } catch (error) {
      console.error('Practice exam generation failed:', error);
      return this.getFallbackQuestions(courseType, questionCount);
    }
  }

  detectCourseType(courseName) {
    const name = courseName.toLowerCase();
    if (name.includes('aws') || name.includes('cloud')) return 'aws';
    if (name.includes('terraform')) return 'terraform';
    if (name.includes('devops')) return 'devops';
    return 'general';
  }

  buildExamPrompt(courseType, completedVideos, questionCount) {
    const videoTitles = completedVideos.map(v => v.title).join('\n');
    
    return `Generate ${questionCount} practice exam questions in ExamTopics style for ${courseType.toUpperCase()} certification.

Based on completed videos:
${videoTitles}

ExamTopics Question Format:
- Multiple choice (A, B, C, D)
- Scenario-based questions
- Real-world implementation focus
- Detailed explanations
- Mix of difficulty levels

Question Structure:
1. Context/Scenario (2-3 sentences)
2. Clear question
3. 4 realistic options
4. Detailed explanation for correct answer

Return JSON array:
[{
  "id": "q1",
  "scenario": "A company needs to...",
  "question": "What should the solutions architect recommend?",
  "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
  "correct": 0,
  "explanation": "Detailed explanation with reasoning",
  "difficulty": "medium",
  "topic": "EC2",
  "examWeight": "high"
}]

Focus on practical scenarios, not theoretical concepts. Return only JSON array.`;
  }

  parseQuestions(response) {
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON found');
      
      const cleanJson = jsonMatch[0].replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(cleanJson);
    } catch (error) {
      console.error('Question parsing failed:', error);
      return [];
    }
  }

  getFallbackQuestions(courseType, count) {
    const templates = {
      aws: [
        {
          scenario: "A company runs a web application on EC2 instances behind an Application Load Balancer.",
          question: "What should be implemented to ensure high availability across multiple AZs?",
          options: ["A) Auto Scaling Group", "B) CloudFront", "C) Route 53", "D) ElastiCache"],
          correct: 0,
          explanation: "Auto Scaling Groups automatically distribute instances across multiple AZs for high availability.",
          topic: "EC2"
        }
      ],
      terraform: [
        {
          scenario: "A team needs to manage infrastructure state across multiple environments.",
          question: "What is the best practice for Terraform state management?",
          options: ["A) Local state files", "B) Remote state with locking", "C) Git repository", "D) Shared network drive"],
          correct: 1,
          explanation: "Remote state with locking prevents conflicts and enables team collaboration.",
          topic: "State Management"
        }
      ]
    };

    const baseQuestions = templates[courseType] || templates.aws;
    const questions = [];
    
    for (let i = 0; i < count; i++) {
      const template = baseQuestions[i % baseQuestions.length];
      questions.push({
        id: `fallback_${i + 1}`,
        ...template,
        difficulty: i < 20 ? 'easy' : i < 45 ? 'medium' : 'hard',
        examWeight: i < 30 ? 'high' : 'medium'
      });
    }
    
    return questions;
  }
}

module.exports = new ExamTopicsQuizGenerator();