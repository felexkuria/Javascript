
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
            logger.warn(`Operation attempt ${attempt} failed`, {
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
