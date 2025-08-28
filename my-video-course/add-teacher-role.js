const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

const User = require('./backend/src/models/User');

async function addTeacherRole() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Update your user to have both student and teacher roles
    const email = 'engineerfelex@gmail.com';
    
    let user = await User.findOne({ email });
    
    if (!user) {
      user = new User({
        userId: email,
        name: 'Felex Engineer',
        email,
        roles: ['student', 'teacher']
      });
    } else {
      user.roles = ['student', 'teacher'];
    }
    
    await user.save();
    console.log(`Updated user ${email} with roles:`, user.roles);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

addTeacherRole();