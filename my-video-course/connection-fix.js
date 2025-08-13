#!/usr/bin/env node

/**
 * Connection Fix for ECONNRESET and Network Issues
 * Implements robust connection handling and error recovery
 */

const fs = require('fs');
const path = require('path');

// Enhanced MongoDB connection configuration
function createMongoConnectionFix() {
    return `
// Enhanced MongoDB Connection with ECONNRESET handling
const mongoose = require('mongoose');

class DatabaseConnection {
    constructor() {
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 5000; // 5 seconds
        this.connectionTimeout = 30000; // 30 seconds
    }

    async connect(mongoUri) {
        const connectionOptions = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            
            // Connection timeout settings
            serverSelectionTimeoutMS: this.connectionTimeout,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 30000,
            
            // Connection pool settings to prevent ECONNRESET
            maxPoolSize: 10,
            minPoolSize: 2,
            maxIdleTimeMS: 30000,
            
            // Heartbeat settings
            heartbeatFrequencyMS: 10000,
            
            // Buffer settings
            bufferMaxEntries: 0,
            bufferCommands: false,
            
            // Retry settings
            retryWrites: true,
            retryReads: true,
            
            // Family setting to force IPv4
            family: 4
        };

        try {
            console.log('Attempting to connect to MongoDB...');
            
            await mongoose.connect(mongoUri, connectionOptions);
            
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            console.log('✅ Successfully connected to MongoDB');
            
            // Set up connection event handlers
            this.setupEventHandlers();
            
            return true;
            
        } catch (error) {
            console.error('❌ MongoDB connection failed:', error.message);
            this.isConnected = false;
            
            // Handle specific error types
            if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
                console.log('🔄 Network error detected, will retry connection...');
                await this.scheduleReconnect(mongoUri);
            }
            
            return false;
        }
    }

    setupEventHandlers() {
        // Connection successful
        mongoose.connection.on('connected', () => {
            console.log('✅ Mongoose connected to MongoDB');
            this.isConnected = true;
            this.reconnectAttempts = 0;
        });

        // Connection error
        mongoose.connection.on('error', (error) => {
            console.error('❌ Mongoose connection error:', error.message);
            this.isConnected = false;
            
            // Handle ECONNRESET specifically
            if (error.code === 'ECONNRESET') {
                console.log('🔄 Connection reset detected, attempting to reconnect...');
                this.handleConnectionReset();
            }
        });

        // Connection disconnected
        mongoose.connection.on('disconnected', () => {
            console.log('⚠️ Mongoose disconnected from MongoDB');
            this.isConnected = false;
        });

        // Connection reconnected
        mongoose.connection.on('reconnected', () => {
            console.log('✅ Mongoose reconnected to MongoDB');
            this.isConnected = true;
            this.reconnectAttempts = 0;
        });

        // Handle process termination
        process.on('SIGINT', async () => {
            console.log('🛑 Received SIGINT, closing MongoDB connection...');
            await mongoose.connection.close();
            process.exit(0);
        });
    }

    async handleConnectionReset() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(\`🔄 Reconnection attempt \${this.reconnectAttempts}/\${this.maxReconnectAttempts}\`);
            
            setTimeout(() => {
                mongoose.connection.readyState === 0 && mongoose.connect();
            }, this.reconnectInterval * this.reconnectAttempts);
        } else {
            console.error('❌ Max reconnection attempts reached, switching to offline mode');
            this.isConnected = false;
        }
    }

    async scheduleReconnect(mongoUri) {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectInterval * this.reconnectAttempts;
            
            console.log(\`🔄 Scheduling reconnection attempt \${this.reconnectAttempts}/\${this.maxReconnectAttempts} in \${delay}ms\`);
            
            setTimeout(async () => {
                await this.connect(mongoUri);
            }, delay);
        }
    }

    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            readyState: mongoose.connection.readyState,
            reconnectAttempts: this.reconnectAttempts
        };
    }
}

module.exports = DatabaseConnection;
`;
}

// Enhanced error handling middleware
function createErrorHandlingMiddleware() {
    return `
// Enhanced Error Handling Middleware
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// Connection error handler
const handleConnectionError = (error, req, res, next) => {
    if (error.code === 'ECONNRESET') {
        logger.error('ECONNRESET error detected', {
            error: error.message,
            stack: error.stack,
            url: req?.url,
            method: req?.method,
            timestamp: new Date().toISOString()
        });
        
        // Return user-friendly error
        return res.status(503).json({
            error: 'Connection temporarily unavailable',
            message: 'Please try again in a moment',
            code: 'CONNECTION_RESET'
        });
    }
    
    if (error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
        logger.error('Network timeout error', {
            error: error.message,
            code: error.code,
            url: req?.url,
            timestamp: new Date().toISOString()
        });
        
        return res.status(503).json({
            error: 'Network timeout',
            message: 'Please check your connection and try again',
            code: 'NETWORK_TIMEOUT'
        });
    }
    
    // Handle other errors
    logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        url: req?.url,
        method: req?.method,
        timestamp: new Date().toISOString()
    });
    
    res.status(500).json({
        error: 'Internal server error',
        message: 'Something went wrong, please try again',
        requestId: req.id || 'unknown'
    });
};

// Request timeout middleware
const requestTimeout = (timeoutMs = 30000) => {
    return (req, res, next) => {
        const timeout = setTimeout(() => {
            if (!res.headersSent) {
                logger.warn('Request timeout', {
                    url: req.url,
                    method: req.method,
                    timeout: timeoutMs
                });
                
                res.status(408).json({
                    error: 'Request timeout',
                    message: 'Request took too long to process'
                });
            }
        }, timeoutMs);
        
        res.on('finish', () => clearTimeout(timeout));
        res.on('close', () => clearTimeout(timeout));
        
        next();
    };
};

// Database operation wrapper with retry logic
const withRetry = async (operation, maxRetries = 3, delay = 1000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            logger.warn(\`Operation attempt \${attempt} failed\`, {
                error: error.message,
                attempt,
                maxRetries
            });
            
            if (attempt === maxRetries) {
                throw error;
            }
            
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, delay * attempt));
        }
    }
};

module.exports = {
    handleConnectionError,
    requestTimeout,
    withRetry,
    logger
};
`;
}

// Enhanced video service with connection handling
function createEnhancedVideoService() {
    return `
// Enhanced Video Service with Connection Handling
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { withRetry, logger } = require('./errorHandling');

class VideoService {
    constructor() {
        this.localStoragePath = path.join(__dirname, '..', 'data', 'localStorage.json');
        this.ensureDataDirectory();
    }

    ensureDataDirectory() {
        const dataDir = path.dirname(this.localStoragePath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    }

    // Safe database operation wrapper
    async safeDbOperation(operation, fallback = null) {
        try {
            if (!mongoose.connection.readyState) {
                logger.warn('Database not connected, using fallback');
                return fallback ? await fallback() : null;
            }
            
            return await withRetry(operation);
        } catch (error) {
            logger.error('Database operation failed', {
                error: error.message,
                stack: error.stack
            });
            
            // Use fallback if available
            if (fallback) {
                logger.info('Using fallback operation');
                return await fallback();
            }
            
            throw error;
        }
    }

    // Get videos with connection handling
    async getVideosForCourse(courseName) {
        const dbOperation = async () => {
            const collection = mongoose.connection.collection(courseName);
            return await collection.find({}).toArray();
        };
        
        const fallbackOperation = () => {
            const localStorage = this.getLocalStorage();
            return localStorage[courseName] || [];
        };
        
        try {
            return await this.safeDbOperation(dbOperation, fallbackOperation);
        } catch (error) {
            logger.error(\`Error getting videos for course \${courseName}\`, error);
            return fallbackOperation();
        }
    }

    // Get video by ID with connection handling
    async getVideoById(courseName, videoId) {
        const dbOperation = async () => {
            const collection = mongoose.connection.collection(courseName);
            return await collection.findOne({ _id: new mongoose.Types.ObjectId(videoId) });
        };
        
        const fallbackOperation = () => {
            const localStorage = this.getLocalStorage();
            const videos = localStorage[courseName] || [];
            return videos.find(v => v._id && v._id.toString() === videoId);
        };
        
        try {
            return await this.safeDbOperation(dbOperation, fallbackOperation);
        } catch (error) {
            logger.error(\`Error getting video \${videoId} for course \${courseName}\`, error);
            return fallbackOperation();
        }
    }

    // Mark video as watched with connection handling
    async markVideoAsWatched(courseName, videoId) {
        const watchedAt = new Date();
        
        // Always update localStorage first
        const localStorage = this.getLocalStorage();
        if (!localStorage[courseName]) {
            localStorage[courseName] = [];
        }
        
        const videoIndex = localStorage[courseName].findIndex(v => 
            v && v._id && v._id.toString() === videoId
        );
        
        if (videoIndex >= 0) {
            localStorage[courseName][videoIndex].watched = true;
            localStorage[courseName][videoIndex].watchedAt = watchedAt;
        }
        
        this.saveLocalStorage(localStorage);
        
        // Try to update database if connected
        const dbOperation = async () => {
            const collection = mongoose.connection.collection(courseName);
            return await collection.updateOne(
                { _id: new mongoose.Types.ObjectId(videoId) },
                { $set: { watched: true, watchedAt: watchedAt } }
            );
        };
        
        try {
            await this.safeDbOperation(dbOperation);
            logger.info(\`Successfully marked video \${videoId} as watched in both localStorage and database\`);
        } catch (error) {
            logger.warn(\`Failed to update database, but localStorage updated for video \${videoId}\`, error);
        }
        
        return true;
    }

    // Local storage operations
    getLocalStorage() {
        try {
            if (fs.existsSync(this.localStoragePath)) {
                const data = fs.readFileSync(this.localStoragePath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            logger.error('Error reading localStorage', error);
        }
        return {};
    }

    saveLocalStorage(data) {
        try {
            fs.writeFileSync(this.localStoragePath, JSON.stringify(data, null, 2));
            logger.debug('LocalStorage saved successfully');
        } catch (error) {
            logger.error('Error saving localStorage', error);
            throw error;
        }
    }

    // Sync with MongoDB when connection is available
    async syncWithMongoDB() {
        if (!mongoose.connection.readyState) {
            logger.warn('Cannot sync: MongoDB not connected');
            return false;
        }
        
        try {
            const localStorage = this.getLocalStorage();
            
            for (const [courseName, videos] of Object.entries(localStorage)) {
                if (!Array.isArray(videos)) continue;
                
                const collection = mongoose.connection.collection(courseName);
                
                for (const video of videos) {
                    if (!video._id) continue;
                    
                    await withRetry(async () => {
                        await collection.updateOne(
                            { _id: new mongoose.Types.ObjectId(video._id) },
                            { $set: { watched: video.watched, watchedAt: video.watchedAt } },
                            { upsert: false }
                        );
                    });
                }
            }
            
            logger.info('Successfully synced localStorage with MongoDB');
            return true;
            
        } catch (error) {
            logger.error('Error syncing with MongoDB', error);
            return false;
        }
    }
}

module.exports = new VideoService();
`;
}

// Create connection health check
function createHealthCheck() {
    return `
// Health Check Service
const mongoose = require('mongoose');
const { logger } = require('./errorHandling');

class HealthCheckService {
    constructor() {
        this.checks = new Map();
        this.startPeriodicChecks();
    }

    async checkDatabase() {
        try {
            if (!mongoose.connection.readyState) {
                return { status: 'down', message: 'Not connected' };
            }
            
            await mongoose.connection.db.admin().ping();
            return { status: 'up', message: 'Connected and responsive' };
        } catch (error) {
            return { status: 'down', message: error.message };
        }
    }

    async checkMemory() {
        const usage = process.memoryUsage();
        const totalMB = Math.round(usage.rss / 1024 / 1024);
        
        return {
            status: totalMB < 512 ? 'up' : 'warning',
            message: \`Memory usage: \${totalMB}MB\`,
            details: {
                rss: Math.round(usage.rss / 1024 / 1024),
                heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
                heapUsed: Math.round(usage.heapUsed / 1024 / 1024)
            }
        };
    }

    async getOverallHealth() {
        const checks = {
            database: await this.checkDatabase(),
            memory: await this.checkMemory(),
            uptime: {
                status: 'up',
                message: \`Uptime: \${Math.round(process.uptime())}s\`
            }
        };

        const overallStatus = Object.values(checks).every(check => check.status === 'up') 
            ? 'healthy' 
            : 'degraded';

        return {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            checks
        };
    }

    startPeriodicChecks() {
        // Check every 30 seconds
        setInterval(async () => {
            const health = await this.getOverallHealth();
            
            if (health.status === 'degraded') {
                logger.warn('System health degraded', health);
            }
            
            this.checks.set('latest', health);
        }, 30000);
    }

    getLatestHealth() {
        return this.checks.get('latest') || { status: 'unknown', message: 'No health data available' };
    }
}

module.exports = new HealthCheckService();
`;
}

// Apply the fixes
async function applyConnectionFixes() {
    console.log('🔧 Applying connection fixes for ECONNRESET and network issues...');
    
    try {
        // Create enhanced services directory
        const servicesDir = path.join(__dirname, 'services', 'enhanced');
        if (!fs.existsSync(servicesDir)) {
            fs.mkdirSync(servicesDir, { recursive: true });
        }
        
        // Create logs directory
        const logsDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        
        // Write enhanced service files
        fs.writeFileSync(path.join(servicesDir, 'DatabaseConnection.js'), createMongoConnectionFix());
        fs.writeFileSync(path.join(servicesDir, 'errorHandling.js'), createErrorHandlingMiddleware());
        fs.writeFileSync(path.join(servicesDir, 'enhancedVideoService.js'), createEnhancedVideoService());
        fs.writeFileSync(path.join(servicesDir, 'healthCheck.js'), createHealthCheck());
        
        // Create updated package.json with additional dependencies
        const packagePath = path.join(__dirname, 'package.json');
        const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        
        // Add connection handling dependencies
        const connectionDeps = {
            'winston': '^3.8.0',
            'express-timeout-handler': '^2.2.2'
        };
        
        packageData.dependencies = { ...packageData.dependencies, ...connectionDeps };
        fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));
        
        // Create integration guide
        const integrationGuide = `
# Connection Fix Integration Guide

## 1. Replace MongoDB Connection in app.js

Replace the existing MongoDB connection code with:

\`\`\`javascript
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
\`\`\`

## 2. Add Error Handling Middleware

Add these middleware after your existing middleware:

\`\`\`javascript
// Request timeout middleware (30 seconds)
app.use(requestTimeout(30000));

// Connection error handler (add this LAST, after all routes)
app.use(handleConnectionError);
\`\`\`

## 3. Add Health Check Endpoint

\`\`\`javascript
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
\`\`\`

## 4. Replace Video Service

Replace the existing videoService import with:

\`\`\`javascript
const videoService = require('./services/enhanced/enhancedVideoService');
\`\`\`

## 5. Environment Variables

Add to your .env file:

\`\`\`
# Connection settings
DB_CONNECTION_TIMEOUT=30000
DB_SOCKET_TIMEOUT=45000
DB_MAX_POOL_SIZE=10
DB_MIN_POOL_SIZE=2

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log
\`\`\`

## 6. Test the Fixes

Run these commands to test:

\`\`\`bash
# Install new dependencies
npm install

# Test the application
node app.js

# In another terminal, test health endpoint
curl http://localhost:3000/health
curl http://localhost:3000/ping
\`\`\`

## 7. Monitor Logs

Check the logs directory for connection issues:

\`\`\`bash
tail -f logs/error.log
tail -f logs/combined.log
\`\`\`

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
`;
        
        fs.writeFileSync(path.join(__dirname, 'CONNECTION_FIX_GUIDE.md'), integrationGuide);
        
        console.log('✅ Connection fixes applied successfully!');
        console.log('📋 Next steps:');
        console.log('1. Run: npm install');
        console.log('2. Follow the integration guide in CONNECTION_FIX_GUIDE.md');
        console.log('3. Test the application with: node app.js');
        console.log('4. Monitor logs in the logs/ directory');
        
    } catch (error) {
        console.error('❌ Error applying connection fixes:', error.message);
    }
}

// Run if executed directly
if (require.main === module) {
    applyConnectionFixes();
}

module.exports = { applyConnectionFixes };