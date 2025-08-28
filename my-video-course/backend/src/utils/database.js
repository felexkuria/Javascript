const mongoose = require('mongoose');

async function connectDB() {
  try {
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      console.log('✅ MongoDB connected');
      return true;
    } else {
      console.log('📦 Running in localStorage mode');
      return false;
    }
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.log('📦 Falling back to localStorage mode');
    return false;
  }
}

module.exports = { connectDB };