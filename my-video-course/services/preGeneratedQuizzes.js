// Pre-generated quizzes for different video topics
const preGeneratedQuizzes = {
  // AWS/Cloud Computing
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
    },
    {
      id: 'aws_3',
      question: 'What is the maximum size for a single S3 object?',
      options: ['5 GB', '5 TB', '100 GB', '1 TB'],
      correct: 1,
      explanation: 'The maximum size for a single S3 object is 5 TB.'
    }
  ],
  
  // DevOps
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
  
  // Programming/Development
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
  
  // Video Editing
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
    },
    {
      id: 'video_4',
      question: 'What is a "cut" in video editing?',
      options: ['Deleting a clip', 'A transition between two shots', 'Audio adjustment', 'Color correction'],
      correct: 1,
      explanation: 'A cut is the most basic transition between two shots, where one shot ends and another begins immediately.'
    }
  ],
  
  // General Technology
  'general': [
    {
      id: 'gen_1',
      question: 'What does API stand for?',
      options: ['Application Programming Interface', 'Advanced Programming Interface', 'Application Process Interface', 'Automated Programming Interface'],
      correct: 0,
      explanation: 'API stands for Application Programming Interface.'
    },
    {
      id: 'gen_2',
      question: 'Which protocol is used for secure web communication?',
      options: ['HTTP', 'HTTPS', 'FTP', 'SMTP'],
      correct: 1,
      explanation: 'HTTPS (HTTP Secure) is used for secure web communication.'
    }
  ]
};

class PreGeneratedQuizService {
  // Get quiz based on video title/content
  getQuizForVideo(videoTitle, courseName) {
    const title = videoTitle.toLowerCase();
    const course = courseName.toLowerCase();
    
    // Determine quiz category based on content
    let category = 'general';
    
    if (course.includes('aws') || title.includes('aws') || title.includes('lambda') || title.includes('s3') || title.includes('ec2')) {
      category = 'aws';
    } else if (course.includes('devops') || title.includes('docker') || title.includes('jenkins') || title.includes('ci/cd')) {
      category = 'devops';
    } else if (title.includes('programming') || title.includes('code') || title.includes('javascript') || title.includes('python')) {
      category = 'programming';
    } else if (course.includes('davinci') || course.includes('video') || title.includes('davinci') || title.includes('resolve') || title.includes('editing') || title.includes('color')) {
      category = 'video_editing';
    }
    
    const questions = preGeneratedQuizzes[category] || preGeneratedQuizzes['general'];
    
    // Return 3 random questions
    const shuffled = [...questions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
  }
  
  // Get all available categories
  getCategories() {
    return Object.keys(preGeneratedQuizzes);
  }
  
  // Add new quiz questions
  addQuestions(category, questions) {
    if (!preGeneratedQuizzes[category]) {
      preGeneratedQuizzes[category] = [];
    }
    preGeneratedQuizzes[category].push(...questions);
  }
}

module.exports = new PreGeneratedQuizService();