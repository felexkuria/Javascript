
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
