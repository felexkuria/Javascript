const authService = require('../services/authService');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const user = await authService.getUserFromToken(token);
    req.user = {
      id: user.Username,
      email: user.UserAttributes.find(attr => attr.Name === 'email')?.Value,
      name: user.UserAttributes.find(attr => attr.Name === 'name')?.Value
    };
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const user = await authService.getUserFromToken(token);
      req.user = {
        id: user.Username,
        email: user.UserAttributes.find(attr => attr.Name === 'email')?.Value,
        name: user.UserAttributes.find(attr => attr.Name === 'name')?.Value
      };
    } catch (error) {
      // Continue without user
    }
  }
  next();
};

module.exports = { authenticateToken, optionalAuth };