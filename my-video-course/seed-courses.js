const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

const Course = require('./backend/src/models/Course');

const sampleCourses = [
  {
    title: 'AWS Solutions Architect Associate',
    subtitle: 'Complete AWS SAA-C03 Certification Course',
    description: 'Master AWS cloud services and pass the Solutions Architect Associate exam',
    category: 'Cloud Computing',
    level: 'intermediate',
    price: 99.99,
    status: 'published',
    createdBy: 'admin',
    sections: [
      {
        title: 'Introduction to AWS',
        order: 1,
        lectures: [
          {
            title: 'What is AWS?',
            type: 'video',
            duration: 600,
            order: 1
          },
          {
            title: 'AWS Global Infrastructure',
            type: 'video', 
            duration: 900,
            order: 2
          }
        ]
      }
    ],
    tags: ['aws', 'cloud', 'certification']
  },
  {
    title: 'JavaScript Fundamentals',
    subtitle: 'Learn JavaScript from scratch',
    description: 'Complete guide to modern JavaScript programming',
    category: 'Programming',
    level: 'beginner',
    price: 49.99,
    status: 'published',
    createdBy: 'admin',
    sections: [
      {
        title: 'Getting Started',
        order: 1,
        lectures: [
          {
            title: 'Introduction to JavaScript',
            type: 'video',
            duration: 480,
            order: 1
          }
        ]
      }
    ],
    tags: ['javascript', 'programming', 'web-development']
  },
  {
    title: 'DevOps Bootcamp',
    subtitle: 'Complete DevOps Engineering Course',
    description: 'Learn Docker, Kubernetes, CI/CD, and more',
    category: 'DevOps',
    level: 'advanced',
    price: 149.99,
    status: 'published',
    createdBy: 'admin',
    sections: [
      {
        title: 'Docker Fundamentals',
        order: 1,
        lectures: [
          {
            title: 'What is Docker?',
            type: 'video',
            duration: 720,
            order: 1
          }
        ]
      }
    ],
    tags: ['devops', 'docker', 'kubernetes', 'ci-cd']
  }
];

async function seedCourses() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Clear existing courses
    await Course.deleteMany({});
    console.log('Cleared existing courses');
    
    // Insert sample courses
    const courses = await Course.insertMany(sampleCourses);
    console.log(`Inserted ${courses.length} courses`);
    
    courses.forEach(course => {
      console.log(`- ${course.title} (${course.totalLectures} lectures, ${Math.round(course.totalDuration/60)} min)`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding courses:', error);
    process.exit(1);
  }
}

seedCourses();