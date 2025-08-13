const fs = require('fs');
const path = require('path');

class PDFTodoExtractor {
  constructor() {
    // DevOps course todo templates based on common PDF content patterns
    this.devOpsTodos = {
      'Tools Installation': [
        'Install Homebrew (macOS) or Chocolatey (Windows)',
        'Set up Git and configure user credentials',
        'Install Java JDK and verify installation',
        'Install Maven and add to PATH',
        'Install Node.js and npm',
        'Install Docker and Docker Compose',
        'Verify all tools are working correctly'
      ],
      'Git': [
        'Initialize a new Git repository',
        'Configure Git user name and email',
        'Practice basic Git commands (add, commit, push)',
        'Create and merge branches',
        'Set up remote repository on GitHub/GitLab',
        'Practice resolving merge conflicts'
      ],
      'Build Tools': [
        'Create a Maven project structure',
        'Write a basic pom.xml file',
        'Build project using Maven commands',
        'Set up Gradle build script',
        'Compare Maven vs Gradle workflows'
      ],
      'Cloud & IaaS': [
        'Create AWS free tier account',
        'Launch first EC2 instance',
        'Configure security groups',
        'Set up VPC and subnets',
        'Practice using AWS CLI',
        'Monitor costs and usage'
      ],
      'Docker': [
        'Write your first Dockerfile',
        'Build and run Docker containers',
        'Create multi-container app with Docker Compose',
        'Push images to Docker Hub',
        'Practice container networking',
        'Set up volume mounts for data persistence'
      ],
      'Jenkins': [
        'Install Jenkins locally or on cloud',
        'Create your first Jenkins job',
        'Set up build pipeline',
        'Configure webhooks for automatic builds',
        'Practice with Jenkins plugins',
        'Set up automated testing in pipeline'
      ],
      'AWS': [
        'Deploy application to EC2',
        'Set up Load Balancer',
        'Configure Auto Scaling',
        'Use S3 for static assets',
        'Set up RDS database',
        'Practice with CloudFormation templates'
      ],
      'Kubernetes': [
        'Install kubectl and minikube',
        'Deploy first pod and service',
        'Create deployment and replica sets',
        'Practice with ConfigMaps and Secrets',
        'Set up ingress controller',
        'Monitor cluster with kubectl commands'
      ],
      'Terraform': [
        'Install Terraform CLI',
        'Write first Terraform configuration',
        'Practice terraform plan and apply',
        'Manage state files',
        'Use Terraform modules',
        'Set up remote state backend'
      ],
      'Programming': [
        'Set up development environment',
        'Practice with scripting languages',
        'Write automation scripts',
        'Learn API integration',
        'Practice with configuration management'
      ],
      'Automation': [
        'Identify manual processes to automate',
        'Write deployment scripts',
        'Set up monitoring and alerting',
        'Practice with infrastructure as code',
        'Implement CI/CD best practices'
      ]
    };
  }

  // Extract todos based on video title and course content
  extractTodosForVideo(videoTitle, courseName) {
    const todos = [];
    
    // Normalize video title for matching
    const normalizedTitle = videoTitle.toLowerCase();
    
    // Match video title to todo categories
    for (const [category, categoryTodos] of Object.entries(this.devOpsTodos)) {
      const categoryLower = category.toLowerCase();
      
      // Check if video title contains category keywords
      if (normalizedTitle.includes(categoryLower) || 
          normalizedTitle.includes(categoryLower.replace(' ', '')) ||
          this.matchesKeywords(normalizedTitle, categoryLower)) {
        
        todos.push({
          category: category,
          items: categoryTodos.map((todo, index) => ({
            id: `${category.toLowerCase().replace(/\s+/g, '_')}_${index}`,
            text: todo,
            completed: false,
            priority: this.getPriority(todo),
            estimatedTime: this.getEstimatedTime(todo)
          }))
        });
      }
    }
    
    // If no specific match, provide general DevOps todos
    if (todos.length === 0 && courseName.toLowerCase().includes('devops')) {
      todos.push({
        category: 'General DevOps Practice',
        items: [
          {
            id: 'general_0',
            text: 'Review video content and take notes',
            completed: false,
            priority: 'medium',
            estimatedTime: '10 min'
          },
          {
            id: 'general_1', 
            text: 'Practice commands shown in the video',
            completed: false,
            priority: 'high',
            estimatedTime: '20 min'
          },
          {
            id: 'general_2',
            text: 'Set up lab environment for hands-on practice',
            completed: false,
            priority: 'high',
            estimatedTime: '30 min'
          }
        ]
      });
    }
    
    return todos;
  }

  // Match video title with category keywords
  matchesKeywords(title, category) {
    const keywordMap = {
      'tools installation': ['install', 'setup', 'configure', 'tool'],
      'git': ['git', 'version control', 'repository', 'commit'],
      'build tools': ['maven', 'gradle', 'build', 'compile'],
      'cloud & iaas': ['cloud', 'aws', 'ec2', 'infrastructure'],
      'docker': ['docker', 'container', 'containerization'],
      'jenkins': ['jenkins', 'ci/cd', 'pipeline', 'automation'],
      'kubernetes': ['kubernetes', 'k8s', 'orchestration', 'cluster'],
      'terraform': ['terraform', 'infrastructure as code', 'iac'],
      'programming': ['programming', 'scripting', 'code', 'development'],
      'automation': ['automation', 'script', 'deploy', 'pipeline']
    };
    
    const keywords = keywordMap[category] || [];
    return keywords.some(keyword => title.includes(keyword));
  }

  // Assign priority based on todo content
  getPriority(todoText) {
    const highPriorityKeywords = ['install', 'configure', 'setup', 'create', 'deploy'];
    const mediumPriorityKeywords = ['practice', 'verify', 'monitor', 'review'];
    
    const text = todoText.toLowerCase();
    
    if (highPriorityKeywords.some(keyword => text.includes(keyword))) {
      return 'high';
    } else if (mediumPriorityKeywords.some(keyword => text.includes(keyword))) {
      return 'medium';
    }
    
    return 'low';
  }

  // Estimate time based on todo complexity
  getEstimatedTime(todoText) {
    const text = todoText.toLowerCase();
    
    if (text.includes('install') || text.includes('setup') || text.includes('configure')) {
      return '15-30 min';
    } else if (text.includes('create') || text.includes('build') || text.includes('deploy')) {
      return '20-45 min';
    } else if (text.includes('practice') || text.includes('verify')) {
      return '10-20 min';
    }
    
    return '5-15 min';
  }

  // Get todos for a specific video
  getTodosForVideo(videoTitle, courseName) {
    return this.extractTodosForVideo(videoTitle, courseName);
  }
}

module.exports = new PDFTodoExtractor();