const app = require('./app');
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
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