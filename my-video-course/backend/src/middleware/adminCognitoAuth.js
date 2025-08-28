const cognitoService = require('../services/cognitoService');

const adminCognitoAuth = async (req, res, next) => {
  try {
    // Check for token in Authorization header or cookies
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies.adminToken;
    
    if (!token) {
      return res.redirect('/admin/login');
    }

    // Verify token with Cognito
    const decoded = await cognitoService.verifyToken(token);
    
    if (!decoded) {
      return res.redirect('/admin/login');
    }

    // Check if user is admin or instructor
    const userEmail = decoded.email;
    const isAdmin = userEmail.includes('admin') || userEmail.includes('teacher') || userEmail.includes('instructor');
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = {
      ...decoded,
      isAdmin: userEmail.includes('admin'),
      isInstructor: userEmail.includes('teacher') || userEmail.includes('instructor'),
      email: userEmail
    };

    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    return res.redirect('/admin/login');
  }
};

module.exports = adminCognitoAuth;