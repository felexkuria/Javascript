const mongoose = require('mongoose');

const connectDB = async (retryCount = 5) => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  
  if (!mongoUri) {
    console.error('❌ MONGODB_URI is not defined in environment variables');
    return false;
  }

  while (retryCount > 0) {
    try {
      console.log(`⏳ Attempting to connect to MongoDB... (${retryCount} retries left)`);
      const conn = await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of default 30s
      });
      console.log(`✅ MongoDB Atlas Connected: ${conn.connection.host}`);
      return true;
    } catch (error) {
      retryCount--;
      console.error(`❌ MongoDB Connection Error: ${error.message}`);
      if (retryCount === 0) {
        console.error('❌ All MongoDB connection retries failed.');
        return false;
      }
      // Wait 2 seconds before retrying
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
};

module.exports = connectDB;
