const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

async function testDashboardMongoDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Test Video model
    const Video = require('./backend/src/models/Video');
    const videoCount = await Video.countDocuments();
    console.log(`📹 Videos in MongoDB: ${videoCount}`);
    
    if (videoCount > 0) {
      const courseNames = await Video.distinct('courseName');
      console.log(`📚 Courses found: ${courseNames.length}`);
      courseNames.forEach(name => console.log(`  - ${name}`));
    } else {
      console.log('⚠️ No videos found in Video model, checking collections...');
      
      // Check collections
      const collections = await mongoose.connection.db.listCollections().toArray();
      const courseCollections = collections.filter(c => 
        !['gamification', 'video_editing', 'videos', 'videoCourseDB', 'courses', 'users', 'products', 'orders', 'video_quizzes', 'enrollments', 'teacherrequests'].includes(c.name)
      );
      
      console.log(`📂 Course collections: ${courseCollections.length}`);
      for (const collection of courseCollections) {
        const count = await mongoose.connection.collection(collection.name).countDocuments();
        console.log(`  - ${collection.name}: ${count} videos`);
      }
    }
    
    // Test User and Enrollment models
    const User = require('./backend/src/models/User');
    const Enrollment = require('./backend/src/models/Enrollment');
    
    const userCount = await User.countDocuments();
    const enrollmentCount = await Enrollment.countDocuments();
    
    console.log(`👤 Users: ${userCount}`);
    console.log(`📝 Enrollments: ${enrollmentCount}`);
    
    if (userCount > 0) {
      const users = await User.find({}, 'email roles').limit(5);
      users.forEach(user => {
        console.log(`  - ${user.email}: ${user.roles.join(', ')}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testDashboardMongoDB();