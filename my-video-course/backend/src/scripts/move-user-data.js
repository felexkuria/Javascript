const mongoose = require('mongoose');
require('dotenv').config();

async function moveUserData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const sourceId = '68af32adeb5a7cdc921b29da';
    const targetId = '68af2edfeb5a7cdc921b29d0';
    
    // Get all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    for (const collection of collections) {
      const collectionName = collection.name;
      const coll = mongoose.connection.collection(collectionName);
      
      // Move data from source user to target user
      const result = await coll.updateMany(
        { userId: 'felex.kuria' },
        { $set: { userId: 'engineerfelex.gmail.com' } }
      );
      
      if (result.modifiedCount > 0) {
        console.log(`✅ Updated ${result.modifiedCount} records in ${collectionName}`);
      }
    }
    
    await mongoose.disconnect();
    console.log('🎉 User data migration completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

moveUserData();