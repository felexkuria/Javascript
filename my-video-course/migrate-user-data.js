const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: './backend/.env' });

const User = require('./backend/src/models/User');

async function migrateUserData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Read data files
    const gamificationPath = path.join(__dirname, 'data/gamification.json');
    const todoPath = path.join(__dirname, 'data/todo_progress.json');
    
    const gamificationData = JSON.parse(fs.readFileSync(gamificationPath, 'utf8'));
    const todoData = JSON.parse(fs.readFileSync(todoPath, 'utf8'));

    // Migrate default_user data
    const defaultUserGamification = gamificationData.default_user;
    
    const userData = {
      userId: 'default_user',
      gamification: {
        achievements: defaultUserGamification.achievements || [],
        streakData: defaultUserGamification.streakData || {},
        userStats: defaultUserGamification.userStats || {}
      },
      todoProgress: {}
    };

    // Use todo progress as-is (object format)
    userData.todoProgress = todoData;

    // Create or update user
    await User.findOneAndUpdate(
      { userId: 'default_user' },
      userData,
      { upsert: true, new: true }
    );

    console.log('User data migrated successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error.message);
    process.exit(1);
  }
}

migrateUserData();