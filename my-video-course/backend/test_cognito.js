const { CognitoIdentityProviderClient, GetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
async function test() {
  const client = new CognitoIdentityProviderClient({ region: 'us-east-1' });
  try {
    await client.send(new GetUserCommand({ AccessToken: "[object Object]" }));
  } catch(e) { console.log(e.message); }
}
test();
