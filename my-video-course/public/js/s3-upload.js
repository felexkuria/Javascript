/**
 * S3 Upload Handler
 * 
 * This script handles direct uploads to S3 from the browser
 */

class S3Uploader {
  constructor(options = {}) {
    this.options = {
      region: options.region || 'us-east-1',
      bucket: options.bucket || '',
      identityPoolId: options.identityPoolId || '',
      onProgress: options.onProgress || (() => {}),
      onComplete: options.onComplete || (() => {}),
      onError: options.onError || (() => {})
    };
    
    this.initializeAWS();
  }
  
  initializeAWS() {
    try {
      console.log('Initializing AWS SDK with:', {
        region: this.options.region,
        bucket: this.options.bucket
      });
      
      // Validate required options
      if (!this.options.region) throw new Error('AWS region is required');
      if (!this.options.bucket) throw new Error('S3 bucket name is required');
      
      // Configure AWS SDK
      AWS.config.update({
        region: this.options.region
      });
      
      // Use AWS credentials from environment variables
      this.s3 = new AWS.S3({
        params: { Bucket: this.options.bucket },
        accessKeyId: AWS.config.credentials ? AWS.config.credentials.accessKeyId : undefined,
        secretAccessKey: AWS.config.credentials ? AWS.config.credentials.secretAccessKey : undefined
      });
      
      console.log('AWS SDK initialized successfully');
    } catch (err) {
      console.error('Error initializing AWS SDK:', err);
      throw err;
    }
  }
  
  upload(file, key) {
    try {
      if (!file) {
        throw new Error('No file provided');
      }
      
      if (!key) {
        key = `uploads/${Date.now()}-${encodeURIComponent(file.name)}`;
      }
      
      console.log('Starting S3 upload with params:', {
        bucket: this.options.bucket,
        key: key,
        contentType: file.type,
        fileSize: file.size
      });
      
      const params = {
        Bucket: this.options.bucket,
        Key: key,
        Body: file,
        ContentType: file.type,
        ACL: 'public-read'
      };
      
      // Upload file to S3
      const upload = this.s3.upload(params);
      
      upload.on('httpUploadProgress', (progress) => {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        console.log(`Upload progress: ${percent}%`);
        this.options.onProgress(percent, progress);
      });
      
      upload.send((err, data) => {
        if (err) {
          console.error('Error uploading to S3:', err);
          this.options.onError(err);
          return;
        }
        
        console.log('Upload completed successfully:', data);
        this.options.onComplete(data);
      });
    } catch (err) {
      console.error('Error in upload method:', err);
      this.options.onError(err);
    }
  }
}

// Export for use in other scripts
window.S3Uploader = S3Uploader;