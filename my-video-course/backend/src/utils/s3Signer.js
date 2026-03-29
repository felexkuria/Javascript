const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

/**
 * 🛰️ S3 Signer Utility (Google-Grade Decoupling)
 * Allows clients to upload directly to S3, bypassing server overhead.
 */
class S3Signer {
  constructor() {
    this.client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
  }

  /**
   * Generates a Presigned PUT URL for a file.
   * @param {string} key - The S3 object key (path).
   * @param {string} contentType - The MIME type of the file.
   * @param {number} expiresIn - Expiration in seconds (default 3600).
   */
  async getPresignedUploadUrl(key, contentType, expiresIn = 3600) {
    try {
      // 🛡️ Parameter Hardening: SDK v3 is strict on whitespace and patterns
      let bucket = (process.env.S3_BUCKET_NAME || '').trim();
      
      // Remove any 's3://' prefix if accidentally entered in .env
      if (bucket.startsWith('s3://')) {
        bucket = bucket.replace('s3://', '');
      }

      if (!bucket) throw new Error('S3_BUCKET_NAME is not configured');
      if (!key) throw new Error('S3 Key is required for presigning');

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key.trim(),
        ContentType: contentType || 'application/octet-stream'
      });

      console.log(`📡 Presigning Request: [Bucket: ${bucket}] [Key: ${key}] [Type: ${contentType}]`);
      const url = await getSignedUrl(this.client, command, { expiresIn });
      return { success: true, url, key };
    } catch (error) {
      const errorDetail = {
        message: error.message,
        code: error.name || error.code || 'UnknownError',
        requestId: error.$metadata?.requestId || 'N/A'
      };
      console.error('❌ Presigned URL Generation Failed:', JSON.stringify(errorDetail, null, 2));
      return { success: false, error: `${errorDetail.code}: ${errorDetail.message} (Req: ${errorDetail.requestId})` };
    }
  }
}

module.exports = new S3Signer();
