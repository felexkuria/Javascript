const cognitoService = require('../services/cognitoService');
const ADMIN_EMAIL = 'engineerfelex@gmail.com';

class AuthController {
  renderLogin(req, res) {
    res.render('pages/login', { error: null });
  }

  renderSignup(req, res) {
    res.render('pages/signup', { error: null });
  }

  renderForgotPassword(req, res) {
    res.render('pages/forgot-password', { error: null });
  }

  renderResetPassword(req, res) {
    res.render('pages/reset-password', { error: null });
  }

  async adminAuth(req, res) {
    const { email, password } = req.body;
    
    if (email !== ADMIN_EMAIL) {
      return res.json({ success: false, error: 'Admin access only' });
    }
    
    try {
      const result = await cognitoService.signIn(email, password);
      
      req.session.user = {
        email: ADMIN_EMAIL,
        roles: ['admin', 'teacher', 'student'],
        currentRole: 'admin',
        isAdmin: true,
        isTeacher: true,
        token: result.accessToken
      };
      
      res.json({ 
        success: true, 
        message: 'Admin authenticated',
        redirect: '/admin/course-manager'
      });
    } catch (error) {
      res.json({ success: false, error: 'Invalid credentials' });
    }
  }

  logout(req, res) {
    req.session.destroy();
    res.redirect('/login');
  }
}

module.exports = new AuthController();