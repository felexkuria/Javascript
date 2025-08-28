const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3');
const { CognitoIdentityProviderClient, DescribeUserPoolCommand } = require('@aws-sdk/client-cognito-identity-provider');
const dynamodb = require('../../utils/dynamodb');

router.get('/status', async (req, res) => {
  try {
    const status = {
      mongodb: mongoose.connection.readyState === 1,
      dynamodb: dynamodb.isAvailable(),
      s3: false,
      cognito: false,
      userCount: 0
    };

    // Check S3
    try {
      const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
      await s3.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET_NAME }));
      status.s3 = true;
    } catch (error) {
      console.error('S3 check failed:', error.message);
    }

    // Check Cognito
    try {
      const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' });
      await cognito.send(new DescribeUserPoolCommand({ UserPoolId: process.env.COGNITO_USER_POOL_ID }));
      status.cognito = true;
    } catch (error) {
      console.error('Cognito check failed:', error.message);
    }

    res.json({ success: true, ...status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;