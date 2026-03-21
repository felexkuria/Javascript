const fs = require('fs');
const mongoose = require('mongoose');
const config = require('./config');

async function fixDataSync() {
  try {
    await mongoose.connect(config.mongodbUri);
    console.log('Connected to MongoDB');
    
    const localStorage = JSON.parse(fs.readFileSync('data/localStorage.json', 'utf8'));
    let totalSynced = 0;
    
    for (const courseName of Object.keys(localStorage)) {
      const localVideos = localStorage[courseName];
      const collection = mongoose.connection.collection(courseName);
      
      // Get all MongoDB videos for this course
      const mongoVideos = await collection.find({}).toArray();
      const mongoVideoMap = {};
      mongoVideos.forEach(v => mongoVideoMap[v._id.toString()] = v);
      
      for (const localVideo of localVideos) {
        if (localVideo && localVideo.watched === true && localVideo._id) {
          const mongoVideo = mongoVideoMap[localVideo._id.toString()];
          
          if (mongoVideo && !mongoVideo.watched) {
            // Sync to MongoDB
            await collection.updateOne(
              { _id: mongoose.Types.ObjectId(localVideo._id) },
              { $set: { watched: true, watchedAt: localVideo.watchedAt } }
            );
            console.log(`Synced ${localVideo.title} to MongoDB`);
            totalSynced++;
          }
        }
      }
    }
    
    console.log(`\nSynced ${totalSynced} videos to MongoDB`);
    
    // Recount after sync
    let totalLocalWatched = 0;
    let totalMongoWatched = 0;
    
    for (const courseName of Object.keys(localStorage)) {
      const localVideos = localStorage[courseName];
      const localWatched = localVideos.filter(v => v && v.watched === true);
      totalLocalWatched += localWatched.length;
      
      const collection = mongoose.connection.collection(courseName);
      const mongoVideos = await collection.find({}).toArray();
      const mongoWatched = mongoVideos.filter(v => v && v.watched === true);
      totalMongoWatched += mongoWatched.length;
    }
    
    console.log(`\nAfter sync:`);
    console.log(`Local: ${totalLocalWatched} watched videos`);
    console.log(`Mongo: ${totalMongoWatched} watched videos`);
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

fixDataSync();