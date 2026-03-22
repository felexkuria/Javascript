const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const dynamoVideoService = require('../services/dynamoVideoService');
const Course = require('../models/Course');
const User = require('../models/User');

async function migrate() {
  console.log('🚀 Starting Migration: DynamoDB/S3 -> MongoDB Atlas');
  
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');

    // 1. Ensure primary user exists
    const adminEmail = 'engineerfelex@gmail.com';
    let admin = await User.findOne({ email: adminEmail });
    if (!admin) {
      admin = await User.create({
        email: adminEmail,
        name: 'Engineer Felex',
        role: 'admin'
      });
      console.log('👤 Created Admin User');
    }

    // 2. Fetch courses from DynamoDB
    const courses = await dynamoVideoService.getAllCourses(adminEmail);
    console.log(`📚 Found ${courses.length} courses in DynamoDB`);

    for (const dCourse of courses) {
      console.log(`\n🔄 Migrating Course: ${dCourse.name}`);
      
      const slug = dCourse.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      
      // Group videos into sections
      const sectionsMap = new Map();
      
      const videos = dCourse.videos || [];
      console.log(`   📹 Processing ${videos.length} videos`);

      videos.forEach(v => {
        const sectionTitle = v.sectionTitle || v.chapter || 'General Lessons';
        if (!sectionsMap.has(sectionTitle)) {
          sectionsMap.set(sectionTitle, []);
        }
        
        sectionsMap.get(sectionTitle).push({
          title: v.title || 'Untitled Lecture',
          type: 'video',
          contentId: v._id || v.videoId || Date.now().toString(),
          s3Key: v.s3Key,
          duration: v.duration || 0,
          isFree: false
        });
      });

      const sections = Array.from(sectionsMap).map(([title, lectures]) => ({
        title,
        lectures
      }));

      // Update or Create Course in MongoDB
      const courseData = {
        title: dCourse.title || dCourse.name,
        slug: slug,
        description: dCourse.description || `Comprehensive course on ${dCourse.name}`,
        instructorId: adminEmail,
        sections: sections,
        totalVideos: videos.length,
        category: 'Technology',
        level: 'intermediate',
        updatedAt: new Date()
      };

      await Course.findOneAndUpdate(
        { slug: slug },
        courseData,
        { upsert: true, new: true }
      );
      
      console.log(`   ✅ Course "${dCourse.name}" migrated successfully with ${sections.length} sections`);
    }

    console.log('\n🏁 Migration Completed Successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration Failed:', error);
    process.exit(1);
  }
}

migrate();
