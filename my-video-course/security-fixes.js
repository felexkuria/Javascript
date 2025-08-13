#!/usr/bin/env node

/**
 * Quick Security Fixes Script
 * Applies immediate fixes for critical security vulnerabilities
 */

const fs = require('fs');
const path = require('path');

// Utility function to safely log user inputs
function createSafeLogger() {
    return `
// Safe logging utility
function safeLog(message, userInput = '') {
    const sanitizedInput = typeof userInput === 'string' 
        ? encodeURIComponent(userInput).substring(0, 100)
        : '[non-string input]';
    console.log(\`\${message}: \${sanitizedInput}\`);
}

// Export for use in other modules
module.exports = { safeLog };
`;
}

// Authentication middleware
function createAuthMiddleware() {
    return `
// Basic authentication middleware
const jwt = require('jsonwebtoken');

const authenticateUser = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

const requireRole = (role) => {
    return (req, res, next) => {
        if (!req.user || req.user.role !== role) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};

module.exports = { authenticateUser, requireRole };
`;
}

// Input validation middleware
function createValidationMiddleware() {
    return `
// Input validation and sanitization
const DOMPurify = require('isomorphic-dompurify');
const validator = require('validator');

const sanitizeInput = (req, res, next) => {
    // Sanitize string inputs
    for (const key in req.body) {
        if (typeof req.body[key] === 'string') {
            req.body[key] = DOMPurify.sanitize(req.body[key]);
        }
    }
    
    // Sanitize query parameters
    for (const key in req.query) {
        if (typeof req.query[key] === 'string') {
            req.query[key] = DOMPurify.sanitize(req.query[key]);
        }
    }
    
    next();
};

const validateVideoUpload = (req, res, next) => {
    const { title, description, courseId } = req.body;
    
    if (!title || !validator.isLength(title, { min: 1, max: 200 })) {
        return res.status(400).json({ error: 'Invalid title' });
    }
    
    if (description && !validator.isLength(description, { max: 1000 })) {
        return res.status(400).json({ error: 'Description too long' });
    }
    
    if (!courseId || !validator.isAlphanumeric(courseId)) {
        return res.status(400).json({ error: 'Invalid course ID' });
    }
    
    next();
};

module.exports = { sanitizeInput, validateVideoUpload };
`;
}

// CSRF protection setup
function createCSRFProtection() {
    return `
// CSRF Protection
const csrf = require('csurf');

const csrfProtection = csrf({
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    }
});

module.exports = { csrfProtection };
`;
}

// Security headers middleware
function createSecurityHeaders() {
    return `
// Security headers middleware
const helmet = require('helmet');

const securityHeaders = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            mediaSrc: ["'self'"],
            fontSrc: ["'self'"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
});

module.exports = { securityHeaders };
`;
}

// Path traversal protection
function createPathValidator() {
    return `
// Path traversal protection
const path = require('path');

const validatePath = (userPath, allowedDir) => {
    const normalizedPath = path.normalize(userPath);
    const resolvedPath = path.resolve(allowedDir, normalizedPath);
    const allowedPath = path.resolve(allowedDir);
    
    if (!resolvedPath.startsWith(allowedPath)) {
        throw new Error('Path traversal attempt detected');
    }
    
    return resolvedPath;
};

const safeFileAccess = (req, res, next) => {
    try {
        if (req.params.filename) {
            req.params.filename = path.basename(req.params.filename);
        }
        if (req.body.filePath) {
            req.body.filePath = validatePath(req.body.filePath, './public');
        }
        next();
    } catch (error) {
        res.status(400).json({ error: 'Invalid file path' });
    }
};

module.exports = { validatePath, safeFileAccess };
`;
}

// Rate limiting
function createRateLimiting() {
    return `
// Rate limiting configuration
const rateLimit = require('express-rate-limit');

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // limit each IP to 10 uploads per hour
    message: 'Too many uploads from this IP, please try again later.',
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // limit each IP to 200 API requests per windowMs
    message: 'Too many API requests from this IP, please try again later.',
});

module.exports = { generalLimiter, uploadLimiter, apiLimiter };
`;
}

// Main execution function
async function applySecurityFixes() {
    console.log('🔒 Applying critical security fixes...');
    
    try {
        // Create security directory
        const securityDir = path.join(__dirname, 'middleware', 'security');
        if (!fs.existsSync(securityDir)) {
            fs.mkdirSync(securityDir, { recursive: true });
        }
        
        // Create middleware directory
        const middlewareDir = path.join(__dirname, 'middleware');
        if (!fs.existsSync(middlewareDir)) {
            fs.mkdirSync(middlewareDir, { recursive: true });
        }
        
        // Write security middleware files
        fs.writeFileSync(path.join(securityDir, 'logger.js'), createSafeLogger());
        fs.writeFileSync(path.join(securityDir, 'auth.js'), createAuthMiddleware());
        fs.writeFileSync(path.join(securityDir, 'validation.js'), createValidationMiddleware());
        fs.writeFileSync(path.join(securityDir, 'csrf.js'), createCSRFProtection());
        fs.writeFileSync(path.join(securityDir, 'headers.js'), createSecurityHeaders());
        fs.writeFileSync(path.join(securityDir, 'pathValidator.js'), createPathValidator());
        fs.writeFileSync(path.join(securityDir, 'rateLimiting.js'), createRateLimiting());
        
        // Create updated package.json with security dependencies
        const packagePath = path.join(__dirname, 'package.json');
        const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        
        // Add security dependencies
        const securityDeps = {
            'helmet': '^7.0.0',
            'csurf': '^1.11.0',
            'express-rate-limit': '^6.7.0',
            'jsonwebtoken': '^9.0.0',
            'bcrypt': '^5.1.0',
            'validator': '^13.9.0',
            'isomorphic-dompurify': '^2.0.0',
            'winston': '^3.8.0'
        };
        
        packageData.dependencies = { ...packageData.dependencies, ...securityDeps };
        
        // Update multer to secure version
        if (packageData.dependencies.multer) {
            packageData.dependencies.multer = '^2.0.0';
        }
        
        fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));
        
        // Create security configuration file
        const securityConfig = `
// Security Configuration
module.exports = {
    jwt: {
        secret: process.env.JWT_SECRET || 'change-this-in-production',
        expiresIn: '24h'
    },
    upload: {
        maxFileSize: 100 * 1024 * 1024, // 100MB
        allowedMimeTypes: ['video/mp4', 'video/avi', 'video/mov', 'video/mkv'],
        maxFiles: 5
    },
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // requests per window
    },
    cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        credentials: true
    }
};
`;
        
        fs.writeFileSync(path.join(__dirname, 'config', 'security.js'), securityConfig);
        
        // Create example environment file with security settings
        const envExample = fs.readFileSync(path.join(__dirname, '.env.example'), 'utf8');
        const securityEnvVars = `
# Security Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
SESSION_SECRET=your-session-secret-change-this
BCRYPT_ROUNDS=12

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
`;
        
        if (!envExample.includes('JWT_SECRET')) {
            fs.writeFileSync(path.join(__dirname, '.env.example'), envExample + securityEnvVars);
        }
        
        console.log('✅ Security middleware files created');
        console.log('✅ Package.json updated with security dependencies');
        console.log('✅ Security configuration files created');
        
        console.log('\n📋 Next steps:');
        console.log('1. Run: npm install');
        console.log('2. Update your app.js to use the new middleware');
        console.log('3. Set environment variables in .env file');
        console.log('4. Test the application thoroughly');
        console.log('5. Review and customize security settings');
        
        // Create integration guide
        const integrationGuide = `
# Security Middleware Integration Guide

## 1. Update app.js

Add these imports at the top of app.js:

\`\`\`javascript
const { securityHeaders } = require('./middleware/security/headers');
const { generalLimiter, apiLimiter } = require('./middleware/security/rateLimiting');
const { sanitizeInput } = require('./middleware/security/validation');
const { authenticateUser } = require('./middleware/security/auth');
const { safeLog } = require('./middleware/security/logger');
\`\`\`

## 2. Apply middleware in order:

\`\`\`javascript
// Security headers (apply first)
app.use(securityHeaders);

// Rate limiting
app.use(generalLimiter);
app.use('/api/', apiLimiter);

// Input sanitization
app.use(sanitizeInput);

// Authentication for protected routes
app.use('/api/admin', authenticateUser);
app.use('/api/upload', authenticateUser);
\`\`\`

## 3. Replace console.log with safeLog:

\`\`\`javascript
// Instead of:
console.log('User input:', userInput);

// Use:
safeLog('User input', userInput);
\`\`\`

## 4. Environment Variables

Create .env file with:
\`\`\`
JWT_SECRET=your-super-secret-jwt-key
SESSION_SECRET=your-session-secret
BCRYPT_ROUNDS=12
\`\`\`

## 5. Test Security

Run the security test:
\`\`\`bash
node test-security.js
\`\`\`
`;
        
        fs.writeFileSync(path.join(__dirname, 'SECURITY_INTEGRATION.md'), integrationGuide);
        
        console.log('✅ Integration guide created: SECURITY_INTEGRATION.md');
        
    } catch (error) {
        console.error('❌ Error applying security fixes:', error.message);
    }
}

// Run if executed directly
if (require.main === module) {
    applySecurityFixes();
}

module.exports = { applySecurityFixes };