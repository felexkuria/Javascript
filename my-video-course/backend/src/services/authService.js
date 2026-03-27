const bcrypt = require('bcryptjs');
const dynamodb = require('../utils/dynamodb');
const logger = require('../utils/logger');
const cognitoService = require('./cognitoService');

class AuthService {
  /**
   * 🛡️ Google-Grade Authentication Engine
   * Migrates users from Cognito to DynamoDB transparently.
   */
  async login(email, password) {
    try {
      // 1. Try DynamoDB first (New Source of Truth)
      let user = await dynamodb.getUser(email);

      // 🛡️ Google-Grade Fix: Only use DynamoDB if password hash exists
      if (user && user.password) {
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
          logger.info(`🔐 User authenticated via DynamoDB: ${email}`, { email });
          return this.sanitizeUser(user);
        }
        logger.warn(`🚫 Invalid password for DynamoDB user: ${email}`, { email });
        throw new Error('Invalid credentials');
      }

      // If user exists but has no password (Legacy record), or user doesn't exist, try Cognito
      if (user && !user.password) {
        logger.info(`🔄 User ${email} exists without hash. Forcing Cognito verify.`);
      }

      // 2. SHADOW MIGRATION: Check legacy Cognito
      logger.info(`🔄 Shadow Migration: Checking Cognito for ${email}`);
      try {
        const cognitoResult = await cognitoService.signIn(email, password);
        
        // Cognito login succeeded! Create user in DynamoDB for subsequent logins.
        const isAdmin = email === 'engineerfelex@gmail.com';
        const hashedPassword = await bcrypt.hash(password, 10);
        
        user = {
          email,
          password: hashedPassword,
          name: email.split('@')[0], 
          role: isAdmin ? 'admin' : 'student',
          roles: isAdmin ? ['admin', 'teacher', 'student'] : ['student'],
          createdAt: new Date().toISOString()
        };

        await dynamodb.saveUser(user);
        logger.info(`✅ Shadow Migration Success: ${email} moved to DynamoDB`);
        
        return this.sanitizeUser(user);
      } catch (cognitoErr) {
        logger.error(`❌ Authentication failed for ${email} (Both DB & Cognito)`, cognitoErr);
        throw new Error('Invalid credentials');
      }
    } catch (error) {
      throw error;
    }
  }

  async setupAdmin(email, password, adminKey) {
    try {
      if (adminKey !== process.env.ADMIN_KEY) {
        throw new Error('Invalid ADMIN_KEY');
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const adminUser = {
        email,
        password: hashedPassword,
        name: 'Super Admin',
        role: 'admin',
        roles: ['admin', 'teacher', 'student'],
        updatedAt: new Date().toISOString()
      };

      await dynamodb.saveUser(adminUser);
      logger.info(`👑 Super Admin Synchronized: ${email}`);
      return this.sanitizeUser(adminUser);
    } catch (error) {
      logger.error('❌ Super Admin Setup Failed', error);
      throw error;
    }
  }

  async signup(email, password, name) {
    try {
      const existing = await dynamodb.getUser(email);
      if (existing) throw new Error('User already exists');

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = {
        email,
        password: hashedPassword,
        name,
        role: 'student',
        roles: ['student']
      };

      await dynamodb.saveUser(newUser);
      logger.info(`🆕 New User Registered in DynamoDB: ${email}`, { email });
      
      return this.sanitizeUser(newUser);
    } catch (error) {
      logger.error(`❌ Signup failed for ${email}`, error);
      throw error;
    }
  }

  sanitizeUser(user) {
    const { password, ...safeUser } = user;
    return safeUser;
  }
}

module.exports = new AuthService();