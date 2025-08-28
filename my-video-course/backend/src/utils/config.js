require('dotenv').config();

module.exports = {
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/video-course',
  port: process.env.PORT || 3000
};
