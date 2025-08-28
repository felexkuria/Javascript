// Session-based authentication middleware
module.exports = function(req, res, next) {
  if (req.session && req.session.user) {
    req.user = req.session.user;
    return next();
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