const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
async function test() {
  const client = new S3Client({ region: 'us-east-1' });

  // Test 1: Bad Bucket Name
  try {
    await client.send(new PutObjectCommand({ Bucket: 'bucket with spaces', Key: 'a' }));
  } catch(e) { console.log('Bad Bucket:', e.message); }

  // Test 2: Bad Key?
  try {
    await client.send(new PutObjectCommand({ Bucket: 'validbucket', Key: '' }));
  } catch(e) { console.log('Empty Key:', e.message); }

  // Test 3: Bad ContentType?
  try {
    await client.send(new PutObjectCommand({ Bucket: 'validbucket', Key: 'a', ContentType: 'invalid/\\type' }));
  } catch(e) { console.log('Bad Type:', e.message); }
}
test();
