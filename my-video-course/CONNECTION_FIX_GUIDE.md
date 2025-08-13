
# Connection Fix Integration Guide

## 1. Replace MongoDB Connection in app.js

Replace the existing MongoDB connection code with:

```javascript
const DatabaseConnection = require('./services/enhanced/DatabaseConnection');
const { handleConnectionError, requestTimeout } = require('./services/enhanced/errorHandling');
const healthCheck = require('./services/enhanced/healthCheck');

// Initialize database connection
const dbConnection = new DatabaseConnection();

// Connect to MongoDB with enhanced error handling
const connectToMongoDB = async () => {
    try {
        const connected = await dbConnection.connect(config.mongodbUri);
        if (connected) {
            console.log('✅ Database connected successfully');
            isOfflineMode = false;
        } else {
            console.log('⚠️ Running in offline mode');
            isOfflineMode = true;
        }
        return connected;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        isOfflineMode = true;
        return false;
    }
};
```

## 2. Add Error Handling Middleware

Add these middleware after your existing middleware:

```javascript
// Request timeout middleware (30 seconds)
app.use(requestTimeout(30000));

// Connection error handler (add this LAST, after all routes)
app.use(handleConnectionError);
```

## 3. Add Health Check Endpoint

```javascript
// Health check endpoint
app.get('/health', async (req, res) => {
    const health = await healthCheck.getOverallHealth();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
});

// Simple ping endpoint
app.get('/ping', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

## 4. Replace Video Service

Replace the existing videoService import with:

```javascript
const videoService = require('./services/enhanced/enhancedVideoService');
```

## 5. Environment Variables

Add to your .env file:

```
# Connection settings
DB_CONNECTION_TIMEOUT=30000
DB_SOCKET_TIMEOUT=45000
DB_MAX_POOL_SIZE=10
DB_MIN_POOL_SIZE=2

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

## 6. Test the Fixes

Run these commands to test:

```bash
# Install new dependencies
npm install

# Test the application
node app.js

# In another terminal, test health endpoint
curl http://localhost:3000/health
curl http://localhost:3000/ping
```

## 7. Monitor Logs

Check the logs directory for connection issues:

```bash
tail -f logs/error.log
tail -f logs/combined.log
```

## Common ECONNRESET Causes and Solutions

1. **MongoDB Connection Pool**: Fixed with proper pool settings
2. **Network Timeouts**: Fixed with timeout configurations
3. **Unhandled Promise Rejections**: Fixed with proper error handling
4. **Memory Leaks**: Monitor with health checks
5. **Process Crashes**: Fixed with graceful shutdown handling

## Troubleshooting

If you still get ECONNRESET errors:

1. Check MongoDB server status
2. Verify network connectivity
3. Check firewall settings
4. Monitor memory usage
5. Review error logs for patterns
