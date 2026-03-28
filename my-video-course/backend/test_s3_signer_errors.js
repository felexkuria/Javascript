const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
async function test() {
  const client = new S3Client({ region: 'us-east-1' });

  // Test 1: Bad Bucket Name
  try {
    await getSignedUrl(client, new PutObjectCommand({ Bucket: 'bucket with spaces', Key: 'a' }));
  } catch(e) { console.log('Bad Bucket:', e.message); }

  // Test 2: Bad Key?
  try {
    await getSignedUrl(client, new PutObjectCommand({ Bucket: 'validbucket', Key: '' }));
  } catch(e) { console.log('Empty Key:', e.message); }

  // Test 3: Bad ContentType?
  try {
    await getSignedUrl(client, new PutObjectCommand({ Bucket: 'validbucket', Key: 'a', ContentType: 'invalid/\\type' }));
  } catch(e) { console.log('Bad Type:', e.message); }

  // Test 4: Missing Region?
  try {
    const badClient = new S3Client({ region: '' });
    await getSignedUrl(badClient, new PutObjectCommand({ Bucket: 'validbucket', Key: 'a' }));
  } catch(e) { console.log('Bad Region:', e.message); }

}
test();
