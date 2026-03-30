// Session-based authentication middleware with JWT token support and verified email extraction
const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
  // Check session first (primary auth mechanism)
  if (req.session && req.session.user) {
    req.user = req.session.user;
    return next();
  }
  
  // Check for JWT token in Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      // 🔧 FIX: Properly verify and decode JWT so req.user.email is available downstream
      const secret = process.env.JWT_SECRET || 'secret';
      const decoded = jwt.verify(token, secret);
      
      // Populate req.user with verified claims (email, role)
      req.user = {
        email: decoded.email,
        role: decoded.role || 'student',
        roles: decoded.roles || [decoded.role || 'student'],
        isAdmin: decoded.role === 'admin' || decoded.email === 'engineerfelex@gmail.com',
        isTeacher: decoded.role === 'teacher' || decoded.role === 'admin',
        fromToken: true
      };
      return next();
    } catch (error) {
      // Token is invalid/expired — fall through to redirect
      console.warn('JWT verification failed:', error.message);
    }
  }
  
  // Return 401 for API routes
  if (req.accepts('json') && req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' });
  }
  
  // Redirect to login for web routes
  res.redirect('/login');
};