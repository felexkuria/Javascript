const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
require('dotenv').config();

console.log("Starting S3 Test...");
console.log("Bucket:", `[${process.env.S3_BUCKET_NAME}]`);

async function test() {
  try {
    const bucket = (process.env.S3_BUCKET_NAME || '').trim();
    const region = process.env.AWS_REGION || 'us-east-1';
    
    // Explicit undefined checking to mimic exact code path
    const client = new S3Client({
      region: region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    
    const key = `videos/test-course/163...-lesson30.mp4`;
    const contentType = 'video/mp4';
    
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType
    });
    
    console.log("Command created, signing...");
    const url = await getSignedUrl(client, command, { expiresIn: 3600 });
    console.log(`SUCCESS: Signed URL generated: ${url.substring(0, 50)}...`);
  } catch (err) {
    console.error(`FAILED: Error Name: ${err.name}`);
    console.error(`FAILED: Error Message: ${err.message}`);
    console.error(`FAILED: Stack: ${err.stack}`);
  }
}

test();
