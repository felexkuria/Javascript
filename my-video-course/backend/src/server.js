const app = require('./app');
const connectDB = require('./utils/mongodb');
const PORT = process.env.PORT || 3002;

async function startServer() {
  try {
    // Await the database connection before starting the server
    const success = await connectDB();
    if (!success && process.env.NODE_ENV === 'production') {
      console.error('❌ Could not establish database connection in production. Exiting.');
      process.exit(1);
    }

    // Trigger S3 sync on start
    const courseService = require('./services/courseService');
    courseService.syncS3VideosToDynamoDB().catch(e => console.warn('Sync failed:', e.message));

    app.listen(PORT, '0.0.0.0', () => { 
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Web: http://localhost:${PORT}`);
      console.log(`📱 API: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();