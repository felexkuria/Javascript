const { CognitoIdentityProviderClient, SignUpCommand, ConfirmSignUpCommand, InitiateAuthCommand, GetUserCommand, ForgotPasswordCommand, ConfirmForgotPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');

class CognitoService {
  constructor() {
    this.cognito = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    this.userPoolId = process.env.COGNITO_USER_POOL_ID;
    this.clientId = process.env.COGNITO_CLIENT_ID;
  }

  async signUp(email, password, name, role = 'student') {
    const command = new SignUpCommand({
      ClientId: this.clientId,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: name }
      ]
    });

    return await this.cognito.send(command);
  }

  async confirmSignUp(email, confirmationCode) {
    const command = new ConfirmSignUpCommand({
      ClientId: this.clientId,
      Username: email,
      ConfirmationCode: confirmationCode
    });

    return await this.cognito.send(command);
  }

  async signIn(email, password) {
    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: this.clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    });

    const result = await this.cognito.send(command);
    
    if (!result.AuthenticationResult) {
      throw new Error('Authentication failed');
    }
    
    return {
      accessToken: result.AuthenticationResult.AccessToken,
      idToken: result.AuthenticationResult.IdToken,
      refreshToken: result.AuthenticationResult.RefreshToken,
      expiresIn: result.AuthenticationResult.ExpiresIn
    };
  }

  async verifyToken(token) {
    try {
      const command = new GetUserCommand({
        AccessToken: token
      });

      const result = await this.cognito.send(command);
      const email = result.UserAttributes.find(attr => attr.Name === 'email')?.Value;
      
      return {
        email,
        username: result.Username
      };
    } catch (error) {
      console.error('Token verification failed:', error);
      return null;
    }
  }

  async forgotPassword(email) {
    const command = new ForgotPasswordCommand({
      ClientId: this.clientId,
      Username: email
    });

    return await this.cognito.send(command);
  }

  async confirmForgotPassword(email, confirmationCode, newPassword) {
    const command = new ConfirmForgotPasswordCommand({
      ClientId: this.clientId,
      Username: email,
      ConfirmationCode: confirmationCode,
      Password: newPassword
    });

    return await this.cognito.send(command);
  }
}

module.exports = new CognitoService();