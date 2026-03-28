const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
async function test() {
  const client = new S3Client({ 
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'bad_pattern?',
      secretAccessKey: '123'
    }
  });

  try {
    const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: 'validbucket', Key: 'a' }));
    console.log("URL:", url);
  } catch(e) { console.log('Bad Creds:', e.message); }
}
test();
