const mongoose = require('mongoose');
const User = require('./backend/src/models/User');
require('dotenv').config({ path: './backend/.env' });

async function grantTeacherRole() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB');
    
    const email = 'multitouchkenya@gmail.com';
    
    let user = await User.findOne({ email });
    
    if (!user) {
      console.log('📝 Creating new user with teacher role');
      user = new User({
        userId: email,
        name: 'MultiTouch Kenya',
        email: email,
        roles: ['student', 'teacher']
      });
    } else {
      console.log('📝 Updating existing user');
      if (!user.roles.includes('teacher')) {
        user.roles.push('teacher');
      }
    }
    
    await user.save();
    
    console.log('✅ Teacher role granted successfully');
    console.log('👤 User:', user.email);
    console.log('🎭 Roles:', user.roles);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

grantTeacherRole();