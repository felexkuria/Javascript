const cognitoService = require('../services/cognitoService');

class AuthController {
  async renderLogin(req, res) {
    res.render('pages/login', { error: null });
  }

  async renderSignup(req, res) {
    res.render('pages/signup', { error: null });
  }

  async signup(req, res) {
    try {
      const { name, email, password, role = 'student' } = req.body;
      
      if (!name || !email || !password) {
        return res.json({ success: false, error: 'All fields are required' });
      }
      
      if (password.length < 8) {
        return res.json({ success: false, error: 'Password must be at least 8 characters' });
      }
      
      await cognitoService.signUp(email, password, name, role);
      res.json({ success: true, message: 'Account created! Check your email for confirmation code.' });
      
    } catch (error) {
      let errorMessage = error.message;
      if (error.code === 'UsernameExistsException') {
        errorMessage = 'An account with this email already exists';
      } else if (error.code === 'InvalidPasswordException') {
        errorMessage = 'Password must be at least 8 characters with uppercase, lowercase, and number';
      }
      res.json({ success: false, error: errorMessage });
    }
  }

  async confirm(req, res) {
    try {
      const { email, confirmationCode } = req.body;
      await cognitoService.confirmSignUp(email, confirmationCode);
      res.json({ success: true, message: 'Account confirmed successfully' });
    } catch (error) {
      let errorMessage = error.message;
      if (error.code === 'CodeMismatchException') {
        errorMessage = 'Invalid confirmation code';
      } else if (error.code === 'ExpiredCodeException') {
        errorMessage = 'Confirmation code has expired';
      }
      res.json({ success: false, error: errorMessage });
    }
  }

  async signin(req, res) {
    try {
      console.log('Signin request body:', req.body);
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.json({ success: false, error: 'Email and password required' });
      }
      
      const result = await cognitoService.signIn(email, password);
      
      // Synchronize with MongoDB User model
      const User = require('../models/User');
      let mongoUser = await User.findOne({ email });
      
      if (mongoUser && mongoUser.isDeactivated) {
        return res.json({ success: false, error: 'Your account has been deactivated. Please contact support.' });
      }

      if (!mongoUser) {
        console.log('👤 Creating initial user in MongoDB...');
        let role = 'student';
        if (email === 'engineerfelex@gmail.com') {
          role = 'admin';
        } else if (email === 'multitouchkenya@gmail.com') {
          role = 'teacher';
        }
        
        mongoUser = new User({
          email,
          name: email.split('@')[0],
          role: role
        });
        await mongoUser.save();
      } else if (email === 'engineerfelex@gmail.com' && mongoUser.role !== 'admin') {
        mongoUser.role = 'admin';
        await mongoUser.save();
      }

      // Handle teacher role request
      if (req.body.requestedRole === 'teacher' && mongoUser.role === 'student') {
        if (email === 'multitouchkenya@gmail.com' || email === 'engineerfelex@gmail.com') {
          mongoUser.role = 'teacher';
          await mongoUser.save();
        }
      }

      // Standardize session role
      const currentRole = (req.body.requestedRole && (mongoUser.role === req.body.requestedRole || mongoUser.role === 'admin'))
        ? req.body.requestedRole
        : mongoUser.role;
        
      req.session.user = { 
        id: mongoUser._id.toString(),
        email, 
        name: mongoUser.name,
        role: mongoUser.role,
        currentRole,
        isTeacher: mongoUser.role === 'teacher' || mongoUser.role === 'admin',
        isAdmin: mongoUser.role === 'admin',
        token: result.accessToken 
      };
      
      res.json({ 
        success: true,
        accessToken: result.accessToken,
        idToken: result.idToken,
        refreshToken: result.refreshToken,
        user: { 
          email, 
          roles: [mongoUser.role],
          currentRole,
          name: mongoUser.name,
          isAdmin: mongoUser.role === 'admin',
          isTeacher: mongoUser.role === 'teacher' || mongoUser.role === 'admin'
        },
        redirect: '/dashboard'
      });
      
    } catch (error) {
      console.error('Signin error details:', error);
      let errorMessage = 'Login failed: ' + (error.message || 'Unknown error');
      
      if (error.code === 'NotAuthorizedException') {
        errorMessage = 'Invalid email or password';
      } else if (error.code === 'UserNotConfirmedException') {
        errorMessage = 'Please confirm your email first';
      } else if (error.code === 'UserNotFoundException') {
        errorMessage = 'User not found';
      }
      
      res.json({ success: false, error: errorMessage, code: error.code });
    }
  }

  async logout(req, res) {
    try {
      if (req.session) req.session.destroy();
      res.clearCookie('cognitoToken');
      res.clearCookie('connect.sid');
      res.json({ success: true });
    } catch (error) {
      res.json({ success: true });
    }
  }

  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      await cognitoService.forgotPassword(email);
      res.json({ success: true, message: 'Password reset code sent to your email' });
    } catch (error) {
      res.json({ success: false, error: error.message });
    }
  }

  async confirmForgotPassword(req, res) {
    try {
      const { email, code, newPassword } = req.body;
      await cognitoService.confirmForgotPassword(email, code, newPassword);
      res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
      res.json({ success: false, error: error.message });
    }
  }

  async setupAdmin(req, res) {
    try {
      const { email, password, adminKey } = req.body;
      if (adminKey !== (process.env.ADMIN_KEY || 'admin123')) {
        return res.status(403).json({ success: false, error: 'Unauthorized: Invalid Admin Key' });
      }
      await cognitoService.adminCreateUser(email, password);
      res.json({ success: true, message: 'Admin user created successfully' });
    } catch (error) {
      res.json({ success: false, error: error.message });
    }
  }

  async getMe(req, res) {
    try {
      const user = req.user || req.session?.user;
      if (!user) return res.status(401).json({ success: false, message: 'Not authenticated' });
      res.json({ success: true, user });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new AuthController();