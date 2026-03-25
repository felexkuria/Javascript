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

  renderAdminLogin(req, res) {
    res.render('admin-login', { error: null });
  }

  async adminAuth(req, res) {
    const { email, password } = req.body;
    
    if (email !== ADMIN_EMAIL) {
      return res.status(403).json({ success: false, error: 'Admin access only' });
    }
    
    try {
      const result = await cognitoService.signIn(email, password);
      
      req.session.user = {
        email: ADMIN_EMAIL,
        roles: ['admin', 'teacher', 'student'],
        currentRole: 'admin',
        isAdmin: true,
        isTeacher: true,
        role: 'admin',
        token: result.accessToken
      };
      
      res.json({ 
        success: true, 
        message: 'Admin authenticated',
        redirect: '/admin/course-manager'
      });
    } catch (error) {
      console.error('Admin Auth Error:', error);
      res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
  }

  async signup(req, res) {
    try {
      const { email, password, name } = req.body;
      const result = await cognitoService.signUp(email, password, name);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Signup error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async confirm(req, res) {
    try {
      const { email, code } = req.body;
      const result = await cognitoService.confirmSignUp(email, code);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Confirm error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async signin(req, res) {
    try {
      const { email, password } = req.body;
      const result = await cognitoService.signIn(email, password);
      
      // Personalize session based on email
      const isAdmin = email === ADMIN_EMAIL;
      
      req.session.user = {
        email: email,
        roles: isAdmin ? ['admin', 'teacher', 'student'] : ['student'],
        currentRole: isAdmin ? 'admin' : 'student',
        isAdmin: isAdmin,
        isTeacher: isAdmin,
        role: isAdmin ? 'admin' : 'student',
        token: result.accessToken
      };

      res.json({ 
        success: true, 
        token: result.accessToken,
        user: req.session.user
      });
    } catch (error) {
      console.error('Signin error:', error);
      res.status(401).json({ success: false, error: error.message });
    }
  }

  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      const result = await cognitoService.forgotPassword(email);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async confirmForgotPassword(req, res) {
    try {
      const { email, code, newPassword } = req.body;
      const result = await cognitoService.confirmForgotPassword(email, code, newPassword);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Confirm forgot password error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async setupAdmin(req, res) {
    try {
      const { email, password, adminKey } = req.body;
      if (adminKey !== process.env.ADMIN_KEY) {
        return res.status(403).json({ success: false, error: 'Invalid admin key' });
      }
      const result = await cognitoService.adminCreateUser(email, password);
      res.json({ success: true, message: 'Admin user created', data: result });
    } catch (error) {
      console.error('Setup admin error:', error);
      res.status(500).json({ success: false, error: error.message });
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