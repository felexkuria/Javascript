const s3Signer = require('./backend/src/utils/s3Signer');
require('./backend/node_modules/dotenv').config({ path: './backend/.env' });

async function testSigner() {
    console.log("🚀 S3 Signer Credential Resolution Test\n");
    try {
        const testKey = "test/lesson1.mp4";
        const contentType = "video/mp4";
        
        console.log(`Checking S3_BUCKET_NAME: ${process.env.S3_BUCKET_NAME}`);
        console.log(`Checking AWS_REGION: ${process.env.AWS_REGION}`);
        console.log(`Checking AWS_ACCESS_KEY_ID exists: ${!!process.env.AWS_ACCESS_KEY_ID}`);
        
        const result = await s3Signer.getPresignedUploadUrl(testKey, contentType);
        
        if (result.success) {
            console.log("\n✅ SUCCESS: Presigned URL generated successfully!");
            console.log(`URL Segment: ${result.url.substring(0, 50)}...`);
        } else {
            console.error("\n❌ FAIL: Signing failed!");
            console.error(`Error: ${result.error}`);
        }
    } catch (err) {
        console.error("\n💥 CRITICAL: Test script execution failed!");
        console.error(err);
    }
}

testSigner();
