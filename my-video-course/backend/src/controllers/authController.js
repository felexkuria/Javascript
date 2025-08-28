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
      console.log('Signin headers:', req.headers['content-type']);
      const { email, password } = req.body;
      
      if (!email || !password) {
        console.log('Missing - email:', email, 'password:', !!password);
        return res.json({ success: false, error: 'Email and password required' });
      }
      
      const result = await cognitoService.signIn(email, password);
      
      // Get or create user in MongoDB
      const User = require('../models/User');
      const TeacherRequest = require('../models/TeacherRequest');
      
      let user = await User.findOne({ email });
      
      if (!user) {
        // Set initial roles based on email
        let roles = ['student'];
        if (email === 'engineerfelex@gmail.com') {
          roles = ['student', 'teacher', 'admin'];
        } else if (email === 'multitouchkenya@gmail.com') {
          roles = ['student', 'teacher'];
        }
        
        user = new User({
          userId: email,
          name: email.split('@')[0],
          email,
          roles
        });
        await user.save();
        console.log('✅ Created user with roles:', roles);
      } else if (email === 'engineerfelex@gmail.com' && !user.roles.includes('admin')) {
        // Ensure admin has all roles
        user.roles = ['student', 'teacher', 'admin'];
        await user.save();
      }
      
      // Handle teacher role request - auto-approve for now
      if (req.body.requestedRole === 'teacher' && !user.roles.includes('teacher')) {
        // Auto-approve teacher role for specific users
        if (email === 'multitouchkenya@gmail.com' || email === 'engineerfelex@gmail.com') {
          if (!user.roles.includes('teacher')) {
            user.roles.push('teacher');
            await user.save();
            console.log('✅ Teacher role granted to:', email);
          }
        } else {
          // Create teacher request for other users
          const existingRequest = await TeacherRequest.findOne({ userId: user._id });
          if (!existingRequest) {
            await TeacherRequest.create({
              userId: user._id,
              email: user.email,
              name: user.name,
              status: 'pending'
            });
          }
        }
      }
      
      // Set session for web routes with proper role
      const currentRole = req.body.requestedRole && user.roles.includes(req.body.requestedRole) 
        ? req.body.requestedRole 
        : user.roles.includes('admin') ? 'admin' 
        : user.roles.includes('teacher') ? 'teacher' 
        : 'student';
        
      req.session.user = { 
        email, 
        roles: user.roles, 
        currentRole,
        isTeacher: user.roles.includes('teacher'),
        isAdmin: user.roles.includes('admin'),
        token: result.accessToken 
      };
      
      console.log('✅ Session set:', {
        email,
        roles: user.roles,
        currentRole,
        requestedRole: req.body.requestedRole,
        isTeacher: user.roles.includes('teacher')
      });
      
      // Return tokens for API usage
      const redirectUrl = currentRole === 'teacher' ? '/dashboard' : '/dashboard';
      
      res.json({ 
        success: true,
        accessToken: result.accessToken,
        idToken: result.idToken,
        refreshToken: result.refreshToken,
        user: { 
          email, 
          roles: user.roles,
          currentRole,
          name: user.name,
          isAdmin: user.roles.includes('admin'),
          isTeacher: user.roles.includes('teacher')
        },
        redirect: redirectUrl
      });
      
    } catch (error) {
      let errorMessage = 'Login failed';
      if (error.code === 'NotAuthorizedException') {
        errorMessage = 'Invalid email or password';
      } else if (error.code === 'UserNotConfirmedException') {
        errorMessage = 'Please confirm your email first';
      } else if (error.code === 'UserNotFoundException') {
        errorMessage = 'User not found';
      }
      
      res.json({ success: false, error: errorMessage });
    }
  }

  async refresh(req, res) {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refreshToken(refreshToken);
      
      if (!result.AuthenticationResult) {
        return res.status(401).json({ 
          success: false, 
          error: "Token refresh failed" 
        });
      }
      
      res.json({
        success: true,
        accessToken: result.AuthenticationResult.AccessToken
      });
    } catch (error) {
      res.status(401).json({ 
        success: false, 
        error: error.message || 'Token refresh failed' 
      });
    }
  }

  async logout(req, res) {
    try {
      // Clear session if exists
      if (req.session) {
        req.session.destroy();
      }
      
      // Clear cookies
      res.clearCookie('cognitoToken');
      res.clearCookie('connect.sid'); // Session cookie
      
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      res.json({ success: true, message: 'Logged out successfully' }); // Always succeed
    }
  }

  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      await cognitoService.forgotPassword(email);
      res.json({ success: true, message: 'Password reset code sent to your email' });
    } catch (error) {
      let errorMessage = error.message;
      if (error.code === 'UserNotFoundException') {
        errorMessage = 'No account found with this email';
      }
      res.json({ success: false, error: errorMessage });
    }
  }

  async confirmForgotPassword(req, res) {
    try {
      const { email, code, newPassword } = req.body;
      await cognitoService.confirmForgotPassword(email, code, newPassword);
      res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
      let errorMessage = error.message;
      if (error.code === 'CodeMismatchException') {
        errorMessage = 'Invalid reset code';
      } else if (error.code === 'ExpiredCodeException') {
        errorMessage = 'Reset code has expired';
      }
      res.json({ success: false, error: errorMessage });
    }
  }
}

module.exports = new AuthController();