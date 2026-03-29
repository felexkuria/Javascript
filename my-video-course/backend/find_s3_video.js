const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend/.env') });

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'video-course-app-video-bucket-prod-6m5k2til';

async function findVideo() {
    console.log(`🔍 Searching S3 bucket: ${BUCKET_NAME} for "bootcamp_overview.mp4"`);
    
    let continuationToken = null;
    let found = false;

    try {
        do {
            const params = {
                Bucket: BUCKET_NAME,
                MaxKeys: 1000,
                ContinuationToken: continuationToken
            };
            
            const command = new ListObjectsV2Command(params);
            const result = await s3Client.send(command);
            
            if (result.Contents) {
                for (const obj of result.Contents) {
                    if (obj.Key.includes('bootcamp_overview.mp4')) {
                        console.log(`✅ FOUND: s3://${BUCKET_NAME}/${obj.Key}`);
                        found = true;
                    }
                }
            }
            continuationToken = result.NextContinuationToken;
            
        } while (continuationToken && !found);

        if (!found) {
            console.log('❌ Could not find "bootcamp_overview.mp4" anywhere in the bucket.');
            
            // List the first few objects to see the structure
            console.log('\n📄 First 10 objects in bucket:');
            const listCmd = new ListObjectsV2Command({ Bucket: BUCKET_NAME, MaxKeys: 10 });
            const listRes = await s3Client.send(listCmd);
            (listRes.Contents || []).forEach(o => console.log(` - ${o.Key}`));
        }
    } catch (err) {
        console.error('❌ S3 Error:', err.message);
    }
}

findVideo();
