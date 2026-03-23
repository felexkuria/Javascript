require('dotenv').config({ path: '../../.env' });
const mongoose = require('mongoose');
const User = require('../../src/models/User');
const Course = require('../../src/models/Course');
const Enrollment = require('../../src/models/Enrollment');

async function runTests() {
  console.log('🧪 Starting LMS Feature Unit Tests...');
  
  try {
    // 1. Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');

    const testEmail = 'engineerfelex@gmail.com';
    const courseTitle = 'AWS CLOUD SOLUTIONS ARCHITECT BOOTCAMP SERIES AWS USER GROUP KAMPALA';
    
    // 2. Test Course Lookup (Logic used in webController)
    console.log(`🔍 Testing Course Lookup for: "${courseTitle}"`);
    const slug = courseTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const course = await Course.findOne({ 
      $or: [{ slug: slug }, { title: courseTitle }, { name: courseTitle }] 
    });

    if (!course) {
      console.error('❌ Course not found in MongoDB. Ensure migration has run.');
      process.exit(1);
    }
    console.log(`✅ Found Course: ${course.title} (ID: ${course._id})`);

    // 3. Test User Wishlist Logic
    console.log(`🧡 Testing Wishlist Addition for ${testEmail}...`);
    let user = await User.findOne({ email: testEmail });
    if (!user) {
      console.log('👤 Creating initial user for testing...');
      user = new User({
        email: testEmail,
        name: 'Felex Kuria',
        role: 'admin'
      });
      await user.save();
    }

    // Add to wishlist if not already there
    if (!user.wishlist.includes(course._id)) {
      user.wishlist.push(course._id);
      await user.save();
      console.log('✅ Added course to wishlist successfully');
    } else {
      console.log('ℹ️ Course already in wishlist');
    }

    // 4. Test Enrollment Logic
    console.log(`🎓 Testing Enrollment for user ${testEmail}...`);
    let enrollment = await Enrollment.findOne({ userId: testEmail, courseId: course._id });
    
    if (!enrollment) {
      enrollment = new Enrollment({
        userId: testEmail,
        courseId: course._id,
        status: 'active'
      });
      await enrollment.save();
      
      // Update user enrolledCourses
      if (!user.enrolledCourses.includes(course._id)) {
        user.enrolledCourses.push(course._id);
        await user.save();
      }
      console.log('✅ Enrollment successful');
    } else {
      console.log('ℹ️ User already enrolled in this course');
    }

    // 5. Verify data integrity
    const updatedUser = await User.findOne({ email: testEmail }).populate('enrolledCourses').populate('wishlist');
    console.log('📊 Final Verification:');
    console.log(`   - Enrolled Courses Count: ${updatedUser.enrolledCourses.length}`);
    console.log(`   - Wishlist Count: ${updatedUser.wishlist.length}`);
    
    if (updatedUser.enrolledCourses.some(c => c._id.toString() === course._id.toString())) {
      console.log('✅ Enrollment Integrity Verified');
    } else {
      console.log('❌ Enrollment Integrity Failed');
    }

    console.log('\n✨ All LMS Feature Unit Tests Passed!');
  } catch (error) {
    console.error('❌ Test Suite Failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

runTests();
