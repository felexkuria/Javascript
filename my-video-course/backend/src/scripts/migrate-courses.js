const mongoose = require('mongoose');
require('dotenv').config();

async function migrateCourses() {
  try {
    // Connect to Cluster0 (destination)
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to Cluster0');
    
    // Create courses collection with AWS course data
    const coursesData = [
      {
        name: 'aws-course',
        title: 'AWS CLOUD SOLUTIONS ARCHITECT BOOTCAMP SERIES',
        description: 'AWS USER GROUP KAMPALA',
        thumbnail: '/thumbnails/aws-course.jpg',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    
    const coursesCollection = mongoose.connection.collection('courses');
    await coursesCollection.insertMany(coursesData);
    console.log('✅ AWS course created in Cluster0');
    
    // Create sample videos for the AWS course
    const videosData = [
      {
        _id: new mongoose.Types.ObjectId(),
        title: 'Introduction to AWS',
        description: 'Getting started with AWS Cloud Services',
        courseName: 'aws-course',
        videoUrl: 's3://video-course-bucket-047ad47c/videos/aws-course/intro.mp4',
        thumbnailUrl: '/thumbnails/aws-intro.jpg',
        watched: false,
        captionsReady: false,
        quizReady: false,
        summaryReady: false,
        processing: false,
        createdAt: new Date()
      },
      {
        _id: new mongoose.Types.ObjectId(),
        title: 'AWS EC2 Fundamentals',
        description: 'Understanding Elastic Compute Cloud',
        courseName: 'aws-course',
        videoUrl: 's3://video-course-bucket-047ad47c/videos/aws-course/ec2.mp4',
        thumbnailUrl: '/thumbnails/aws-ec2.jpg',
        watched: false,
        captionsReady: false,
        quizReady: false,
        summaryReady: false,
        processing: false,
        createdAt: new Date()
      }
    ];
    
    const videosCollection = mongoose.connection.collection('videos');
    await videosCollection.insertMany(videosData);
    console.log('✅ AWS course videos created in Cluster0');
    
    await mongoose.disconnect();
    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

migrateCourses();