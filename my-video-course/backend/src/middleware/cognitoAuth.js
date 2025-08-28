const cognitoAuth = async (req, res, next) => {
  // ✅ Extract token from Authorization header or fallback to query/cookie
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') 
    ? authHeader.replace('Bearer ', '')
    : req.query.token || req.cookies.cognitoToken;
  
  if (!token) {
    // Return JSON for API requests, redirect for web requests
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/api/auth/login');
  }
  
  try {
    const cognitoService = require('../services/cognitoService');
    const user = await cognitoService.verifyToken(token);
    
    if (!user) {
      throw new Error('Invalid token');
    }
    
    res.cookie('cognitoToken', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    });
    
    // Handle both old and new user object formats
    const email = user.UserAttributes?.find(attr => attr.Name === 'email')?.Value || user.email;
    const username = user.Username || user.username;
    const isTeacher = email && (email.includes('teacher') || email.includes('admin') || email.includes('instructor'));
    
    req.user = {
      userId: username,
      email,
      isTeacher
    };
    next();
  } catch (error) {
    console.warn('Token expired, logging out user');
    
    // Clear all authentication data
    res.clearCookie('cognitoToken');
    res.clearCookie('connect.sid');
    if (req.session) {
      req.session.destroy();
    }
    
    // Return JSON for API requests, redirect for web requests
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Session expired, please login again' });
    }
    res.redirect('/login');
  }
};

module.exports = cognitoAuth;