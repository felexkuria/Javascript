const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');

class AuthService {
  constructor() {
    this.cognito = new AWS.CognitoIdentityServiceProvider({
      region: process.env.AWS_REGION
    });
    this.userPoolId = process.env.COGNITO_USER_POOL_ID;
    this.clientId = process.env.COGNITO_CLIENT_ID;
  }

  async signUp(email, password, name) {
    const params = {
      ClientId: this.clientId,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: name }
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

    return await this.cognito.initiateAuth(params).promise();
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
}

module.exports = new AuthService();