const authService = require('../services/authService');
const logger = require('../utils/logger');
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

  renderAdminLogin(req, res) {
    res.render('admin-login', { error: null });
  }

  async adminAuth(req, res) {
    const { email, password } = req.body;
    if (email !== ADMIN_EMAIL) {
      return res.status(403).json({ success: false, error: 'Admin access only' });
    }
    
    try {
      const user = await authService.login(email, password);
      
      req.session.user = {
        ...user,
        isAdmin: true,
        isTeacher: true,
        currentRole: 'admin',
        role: 'admin'
      };
      
      req.session.save((err) => {
        if (err) return res.status(500).json({ success: false, error: 'Session commit failure' });
        res.json({ 
          success: true, 
          message: 'Admin authenticated',
          redirect: '/admin/course-manager'
        });
      });
    } catch (error) {
      logger.error('Admin Auth Error', error);
      res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
  }

  async signup(req, res) {
    try {
      const { email, password, name } = req.body;
      const user = await authService.signup(email, password, name);
      res.json({ success: true, user });
    } catch (error) {
      logger.error('Signup error', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async signin(req, res) {
    try {
      const { email, password, requestedRole } = req.body;
      const user = await authService.login(email, password);
      
      // Personalize session based on email and requested role
      const isAdmin = email === ADMIN_EMAIL;
      const isTeacher = user.role === 'teacher' || isAdmin;
      
      let finalRole = isAdmin ? 'admin' : (user.role || 'student');
      if (requestedRole === 'teacher' && isTeacher) {
        finalRole = 'teacher';
      } else if (requestedRole === 'student') {
        finalRole = 'student';
      }

      req.session.user = {
        ...user,
        currentRole: finalRole,
        isAdmin,
        isTeacher,
        role: finalRole
      };

      req.session.save((err) => {
        if (err) {
          logger.error('Session save error', err);
          return res.status(500).json({ success: false, error: 'Session commit failure' });
        }
        res.json({ 
          success: true, 
          user: req.session.user
        });
      });
    } catch (error) {
      logger.error('Signin error', error);
      res.status(401).json({ success: false, error: error.message });
    }
  }

  async forgotPassword(req, res) {
    // Keep legacy Cognito for reset logic unless also migrated to DynamoDB SES
    const cognitoService = require('../services/cognitoService');
    try {
      const { email } = req.body;
      const result = await cognitoService.forgotPassword(email);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async confirmForgotPassword(req, res) {
    const cognitoService = require('../services/cognitoService');
    try {
      const { email, code, newPassword } = req.body;
      const result = await cognitoService.confirmForgotPassword(email, code, newPassword);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getMe(req, res) {
    if (!req.session?.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    res.json({ success: true, user: req.session.user });
  }

  logout(req, res) {
    req.session.destroy();
    res.redirect('/login');
  }
}

module.exports = new AuthController();