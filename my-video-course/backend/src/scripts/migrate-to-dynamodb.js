const fs = require('fs');
const path = require('path');
const dynamoDBService = require('../utils/dynamodb');

async function migrateToDynamoDB() {
  console.log('🔄 Starting migration from localStorage to DynamoDB...');

  try {
    // MongoDB migration is retired in Pure Cloud architecture

    // Create DynamoDB tables first
    await dynamoDBService.createTables();

    // Read localStorage data
    const localStoragePath = path.join(__dirname, '../../../data/localStorage.json');
    const gamificationPath = path.join(__dirname, '../../../data/gamification.json');
    
    let localStorageData = {};
    let gamificationData = {};

    if (fs.existsSync(localStoragePath)) {
      localStorageData = JSON.parse(fs.readFileSync(localStoragePath, 'utf8'));
      console.log('📦 Loaded localStorage data');
    }

    if (fs.existsSync(gamificationPath)) {
      gamificationData = JSON.parse(fs.readFileSync(gamificationPath, 'utf8'));
      console.log('🎮 Loaded gamification data');
    }

    // Migrate video data from localStorage
    let videoCount = 0;
    for (const [courseName, videos] of Object.entries(localStorageData)) {
      if (Array.isArray(videos)) {
        console.log(`📹 Migrating ${videos.length} videos from course: ${courseName}`);
        for (const video of videos) {
          const success = await dynamoDBService.saveVideo({
            ...video,
            courseName: courseName
          });
          if (success) {
            videoCount++;
          }
        }
      }
    }

    // Migrate gamification data
    let gamificationCount = 0;
    for (const [userId, data] of Object.entries(gamificationData)) {
      console.log(`🎯 Migrating gamification data for user: ${userId}`);
      const success = await dynamoDBService.saveGamificationData(userId, data);
      if (success) {
        gamificationCount++;
      }
    }

    console.log('\n🎉 Migration from localStorage completed successfully!');
    console.log('📊 Migration Summary:');
    console.log(`   Videos migrated: ${videoCount}`);
    console.log(`   Gamification records: ${gamificationCount}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if called directly
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
  migrateToDynamoDB()
    .then(() => {
      console.log('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateToDynamoDB };