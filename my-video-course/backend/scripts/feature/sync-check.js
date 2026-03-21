const fs = require('fs');
const mongoose = require('mongoose');
const config = require('./config');

async function checkDataSync() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongodbUri);
    console.log('Connected to MongoDB');
    
    // Read localStorage
    const localStorage = JSON.parse(fs.readFileSync('data/localStorage.json', 'utf8'));
    
    let totalLocalWatched = 0;
    let totalMongoWatched = 0;
    
    for (const courseName of Object.keys(localStorage)) {
      const localVideos = localStorage[courseName];
      const localWatched = localVideos.filter(v => v && v.watched === true);
      totalLocalWatched += localWatched.length;
      
      try {
        const collection = mongoose.connection.collection(courseName);
        const mongoVideos = await collection.find({}).toArray();
        const mongoWatched = mongoVideos.filter(v => v && v.watched === true);
        totalMongoWatched += mongoWatched.length;
        
        console.log(`${courseName}:`);
        console.log(`  Local: ${localWatched.length} watched`);
        console.log(`  Mongo: ${mongoWatched.length} watched`);
      } catch (err) {
        console.log(`${courseName}: MongoDB collection not found`);
      }
    }
    
    console.log(`\nTotals:`);
    console.log(`Local: ${totalLocalWatched} watched videos`);
    console.log(`Mongo: ${totalMongoWatched} watched videos`);
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

checkDataSync();
