const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend/.env') });

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'video-course-app-video-bucket-prod-6m5k2til';

async function listPrefix() {
    const prefixes = [
        'videos/devops_bootcamp_by_tech_world_with_nana/',
        'courses/devops_bootcamp_by_tech_world_with_nana/',
        'videos/dev-ops-bootcamp_202201/'
    ];

    for (const prefix of prefixes) {
        console.log(`\n🔍 Checking prefix: ${prefix}`);
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: prefix,
            MaxKeys: 5
        });

        try {
            const result = await s3Client.send(command);
            if (result.Contents && result.Contents.length > 0) {
                console.log(`✅ Found ${result.Contents.length} objects (first 5):`);
                result.Contents.forEach(o => console.log(` - ${o.Key}`));
            } else {
                console.log('❌ No objects found with this prefix.');
            }
        } catch (err) {
            console.error(`❌ Error checking prefix ${prefix}:`, err.message);
        }
    }
}

listPrefix();
