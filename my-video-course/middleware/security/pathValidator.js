
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
