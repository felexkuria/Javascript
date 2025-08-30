// Session-based authentication middleware with JWT token support
module.exports = function(req, res, next) {
  // Check session first
  if (req.session && req.session.user) {
    req.user = req.session.user;
    return next();
  }
  
  // Check for JWT token in Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      // For now, just check if token exists (Cognito validation happens in cognitoAuth)
      if (token) {
        // Set a basic user object - will be populated by Cognito middleware if needed
        req.user = { fromToken: true };
        return next();
      }
    } catch (error) {
      console.error('Token validation error:', error);
    }
  }
  
  // Redirect to login for web routes
  if (req.path.startsWith('/admin') || req.path.startsWith('/dashboard')) {
    return res.redirect('/login');
  }
  
  // Return 401 for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  res.redirect('/login');
};