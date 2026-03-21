const mongoose = require('mongoose');

async function connectDB() {
  try {
    if (!process.env.MONGODB_URI) {
      console.log('📦 Running in localStorage mode (No URI provided)');
      return false;
    }

    console.log('⏳ Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 15000 // 15 seconds timeout
    });
    
    console.log('✅ MongoDB connected successfully');
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.log('📦 Falling back to localStorage mode due to error');
    return false;
  }
}

module.exports = { connectDB };