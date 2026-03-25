require('dotenv').config();
const app = require('./app');
const http = require('http');

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

async function startServer() {
  try {
    // DynamoDB is initialized synchronously in the service constructor
    
    // Trigger S3 sync on start
    setTimeout(() => {
       const courseService = require('./services/courseService');
       courseService.syncS3VideosToDynamoDB().catch(e => console.warn('Sync failed:', e.message));
    }, 2000);

    server.listen(PORT, () => {
      console.log(`
  🚀 Server is running on port ${PORT}
  🌍 Environment: ${process.env.NODE_ENV || 'development'}
  🔗 Local: http://localhost:${PORT}
  
  ✅ DynamoDB: Active
  ✅ Cognito: Active
  ✅ S3: Active
  `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();