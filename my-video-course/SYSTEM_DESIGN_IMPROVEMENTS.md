# System Design Improvements for Video Course Platform

## Executive Summary

Based on the comprehensive code review and system testing, this document outlines critical improvements needed for your video course platform. The system has good foundational architecture but requires significant security, performance, and architectural enhancements.

## Critical Security Issues (Must Fix Immediately)

### 1. **High Priority Security Vulnerabilities**

#### Log Injection (CWE-117) - 15+ instances
- **Risk**: Attackers can manipulate log entries, forge logs, or inject malicious content
- **Fix**: Sanitize all user inputs before logging
```javascript
// Instead of:
console.log(`User input: ${userInput}`);

// Use:
console.log(`User input: ${encodeURIComponent(userInput)}`);
```

#### Missing Authorization (CWE-862) - 8+ instances
- **Risk**: Unauthorized access to sensitive routes and data
- **Fix**: Implement authentication middleware
```javascript
// Add authentication middleware
const authenticateUser = (req, res, next) => {
    // Implement JWT or session-based auth
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Apply to protected routes
app.post('/api/videos/upload', authenticateUser, uploadHandler);
```

#### Cross-Site Request Forgery (CSRF) - 5+ instances
- **Risk**: Attackers can trick users into performing unwanted actions
- **Fix**: Implement CSRF protection
```javascript
const csrf = require('csurf');
app.use(csrf({ cookie: true }));
```

#### Path Traversal (CWE-22) - 2+ instances
- **Risk**: Attackers can access files outside intended directories
- **Fix**: Validate and sanitize file paths
```javascript
const path = require('path');
const safePath = path.normalize(userPath).replace(/^(\.\.[\/\\])+/, '');
```

#### SQL/NoSQL Injection (CWE-89) - 3+ instances
- **Risk**: Database manipulation and data theft
- **Fix**: Use parameterized queries and input validation

#### Code Injection (CWE-94) - Critical
- **Risk**: Arbitrary code execution
- **Fix**: Remove eval() usage and sanitize dynamic content

### 2. **Package Vulnerabilities**
- **Multer vulnerability**: Update to version 2.0.0
- **Brace-expansion vulnerability**: Run `npm audit fix`

## System Architecture Improvements

### 1. **Authentication & Authorization System**

```javascript
// Implement JWT-based authentication
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

class AuthService {
    static generateToken(user) {
        return jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, {
            expiresIn: '24h'
        });
    }
    
    static verifyToken(token) {
        return jwt.verify(token, process.env.JWT_SECRET);
    }
}

// Role-based access control
const authorize = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    };
};
```

### 2. **Input Validation & Sanitization**

```javascript
const Joi = require('joi');
const DOMPurify = require('isomorphic-dompurify');

// Validation schemas
const videoUploadSchema = Joi.object({
    title: Joi.string().min(1).max(200).required(),
    description: Joi.string().max(1000),
    courseId: Joi.string().alphanum().required()
});

// Sanitization middleware
const sanitizeInput = (req, res, next) => {
    for (const key in req.body) {
        if (typeof req.body[key] === 'string') {
            req.body[key] = DOMPurify.sanitize(req.body[key]);
        }
    }
    next();
};
```

### 3. **Error Handling & Logging**

```javascript
const winston = require('winston');

// Structured logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    ]
});

// Global error handler
app.use((error, req, res, next) => {
    logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip
    });
    
    res.status(500).json({
        error: 'Internal server error',
        requestId: req.id
    });
});
```

### 4. **Database Layer Improvements**

```javascript
// Connection pooling and error handling
const mongoose = require('mongoose');

class DatabaseService {
    static async connect() {
        try {
            await mongoose.connect(process.env.MONGODB_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            });
            
            mongoose.connection.on('error', (err) => {
                logger.error('MongoDB connection error:', err);
            });
            
            mongoose.connection.on('disconnected', () => {
                logger.warn('MongoDB disconnected');
            });
            
        } catch (error) {
            logger.error('Failed to connect to MongoDB:', error);
            throw error;
        }
    }
}

// Repository pattern for data access
class VideoRepository {
    static async findById(id) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error('Invalid video ID');
        }
        return await Video.findById(id);
    }
    
    static async create(videoData) {
        const video = new Video(videoData);
        return await video.save();
    }
}
```

### 5. **Caching Strategy**

```javascript
const Redis = require('redis');
const client = Redis.createClient();

class CacheService {
    static async get(key) {
        try {
            const data = await client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Cache get error:', error);
            return null;
        }
    }
    
    static async set(key, data, ttl = 3600) {
        try {
            await client.setEx(key, ttl, JSON.stringify(data));
        } catch (error) {
            logger.error('Cache set error:', error);
        }
    }
}

// Cache middleware
const cacheMiddleware = (ttl = 300) => {
    return async (req, res, next) => {
        const key = `cache:${req.originalUrl}`;
        const cached = await CacheService.get(key);
        
        if (cached) {
            return res.json(cached);
        }
        
        res.sendResponse = res.json;
        res.json = (body) => {
            CacheService.set(key, body, ttl);
            res.sendResponse(body);
        };
        
        next();
    };
};
```

### 6. **Rate Limiting & Security Headers**

```javascript
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP'
});

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

app.use('/api/', limiter);
```

### 7. **File Upload Security**

```javascript
const multer = require('multer');
const path = require('path');

// Secure file upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/avi', 'video/mov'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
    },
    fileFilter: fileFilter
});
```

## Performance Improvements

### 1. **Database Optimization**

```javascript
// Add indexes for frequently queried fields
const videoSchema = new mongoose.Schema({
    title: { type: String, required: true, index: true },
    courseName: { type: String, required: true, index: true },
    watched: { type: Boolean, default: false, index: true },
    createdAt: { type: Date, default: Date.now, index: true }
});

// Compound indexes for complex queries
videoSchema.index({ courseName: 1, watched: 1 });
videoSchema.index({ courseName: 1, createdAt: -1 });
```

### 2. **API Response Optimization**

```javascript
// Pagination middleware
const paginate = (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    req.pagination = { skip, limit, page };
    next();
};

// Optimized video listing
app.get('/api/videos/:courseName', paginate, async (req, res) => {
    const { skip, limit } = req.pagination;
    const videos = await Video.find({ courseName: req.params.courseName })
        .select('title description thumbnailUrl watched')
        .skip(skip)
        .limit(limit)
        .lean(); // Use lean() for better performance
    
    res.json(videos);
});
```

### 3. **Frontend Optimization**

```javascript
// Lazy loading for videos
const LazyVideoCard = ({ video }) => {
    const [isVisible, setIsVisible] = useState(false);
    const ref = useRef();
    
    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => setIsVisible(entry.isIntersecting),
            { threshold: 0.1 }
        );
        
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);
    
    return (
        <div ref={ref}>
            {isVisible && <VideoCard video={video} />}
        </div>
    );
};
```

## Testing Strategy

### 1. **Unit Tests**

```javascript
// package.json
{
    "scripts": {
        "test": "jest",
        "test:watch": "jest --watch",
        "test:coverage": "jest --coverage"
    },
    "devDependencies": {
        "jest": "^29.0.0",
        "supertest": "^6.0.0"
    }
}

// tests/videoService.test.js
const VideoService = require('../services/videoService');

describe('VideoService', () => {
    test('should get videos for course', async () => {
        const videos = await VideoService.getVideosForCourse('test-course');
        expect(Array.isArray(videos)).toBe(true);
    });
    
    test('should validate video ID', () => {
        expect(() => VideoService.validateVideoId('invalid')).toThrow();
    });
});
```

### 2. **Integration Tests**

```javascript
// tests/api.test.js
const request = require('supertest');
const app = require('../app');

describe('API Endpoints', () => {
    test('GET /api/videos/:courseName', async () => {
        const response = await request(app)
            .get('/api/videos/test-course')
            .expect(200);
        
        expect(response.body).toHaveProperty('videos');
    });
    
    test('POST /api/videos/upload requires auth', async () => {
        await request(app)
            .post('/api/videos/upload')
            .expect(401);
    });
});
```

## Deployment & DevOps

### 1. **Docker Configuration**

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

USER nextjs

EXPOSE 3000

CMD ["node", "app.js"]
```

### 2. **Environment Configuration**

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/video-course
    depends_on:
      - mongo
      - redis
  
  mongo:
    image: mongo:5
    volumes:
      - mongo_data:/data/db
  
  redis:
    image: redis:7-alpine

volumes:
  mongo_data:
```

### 3. **CI/CD Pipeline**

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test
      - run: npm audit
      - run: npm run lint
```

## Monitoring & Observability

### 1. **Health Checks**

```javascript
// Health check endpoint
app.get('/health', async (req, res) => {
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
            database: 'unknown',
            redis: 'unknown'
        }
    };
    
    try {
        await mongoose.connection.db.admin().ping();
        health.services.database = 'healthy';
    } catch (error) {
        health.services.database = 'unhealthy';
        health.status = 'degraded';
    }
    
    res.status(health.status === 'ok' ? 200 : 503).json(health);
});
```

### 2. **Metrics Collection**

```javascript
const prometheus = require('prom-client');

// Custom metrics
const httpRequestDuration = new prometheus.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status']
});

// Metrics middleware
app.use((req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        httpRequestDuration
            .labels(req.method, req.route?.path || req.path, res.statusCode)
            .observe(duration);
    });
    
    next();
});
```

## Implementation Priority

### Phase 1 (Critical - Immediate)
1. Fix all security vulnerabilities
2. Implement authentication/authorization
3. Add input validation and sanitization
4. Update vulnerable packages

### Phase 2 (High Priority - 1-2 weeks)
1. Implement proper error handling
2. Add comprehensive logging
3. Set up monitoring and health checks
4. Add unit and integration tests

### Phase 3 (Medium Priority - 1 month)
1. Implement caching strategy
2. Optimize database queries
3. Add rate limiting
4. Set up CI/CD pipeline

### Phase 4 (Enhancement - 2-3 months)
1. Implement advanced features
2. Performance optimization
3. Advanced monitoring and alerting
4. Documentation and training

## Conclusion

Your video course platform has a solid foundation but requires immediate attention to security vulnerabilities and system architecture improvements. Following this roadmap will result in a secure, scalable, and maintainable application.

The most critical items are the security fixes - these should be implemented immediately before any production deployment.