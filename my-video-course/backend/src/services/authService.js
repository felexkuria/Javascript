const { CognitoIdentityProviderClient } = require('@aws-sdk/client-cognito-identity-provider');
const jwt = require('jsonwebtoken');

class AuthService {
  constructor() {
    this.cognito = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    this.userPoolId = process.env.COGNITO_USER_POOL_ID;
    this.clientId = process.env.COGNITO_CLIENT_ID;
  }

  async signUp(email, password, name, role = 'student') {
    const params = {
      ClientId: this.clientId,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: name },
        { Name: 'custom:role', Value: role }
      ]
    };

    return await this.cognito.signUp(params).promise();
  }

  async confirmSignUp(email, confirmationCode) {
    const params = {
      ClientId: this.clientId,
      Username: email,
      ConfirmationCode: confirmationCode
    };

    return await this.cognito.confirmSignUp(params).promise();
  }

  async signIn(email, password) {
    const params = {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: this.clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    };

    try {
      const result = await this.cognito.initiateAuth(params).promise();
      console.log('Cognito signIn result:', result);
      return result;
    } catch (error) {
      console.error('Cognito signIn error:', error.code, error.message);
      throw error;
    }
  }

  async getUserFromToken(accessToken) {
    const params = {
      AccessToken: accessToken
    };

    return await this.cognito.getUser(params).promise();
  }

  verifyToken(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  async refreshToken(refreshToken) {
    const params = {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: this.clientId,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken
      }
    };

    return await this.cognito.initiateAuth(params).promise();
  }

  async forgotPassword(email) {
    const params = {
      ClientId: this.clientId,
      Username: email
    };

    return await this.cognito.forgotPassword(params).promise();
  }

  async confirmForgotPassword(email, confirmationCode, newPassword) {
    const params = {
      ClientId: this.clientId,
      Username: email,
      ConfirmationCode: confirmationCode,
      Password: newPassword
    };

    return await this.cognito.confirmForgotPassword(params).promise();
  }
}

module.exports = new AuthService();