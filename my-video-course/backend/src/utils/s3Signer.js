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
      const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key,
        ContentType: contentType
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });
      return { success: true, url, key };
    } catch (error) {
      console.error('❌ Presigned URL Generation Failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new S3Signer();
