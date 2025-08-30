// AWS Identity Pool Integration for Direct S3 Access
class AWSIdentityPool {
    constructor() {
        this.identityPoolId = 'us-east-1:437744b6-640c-4b25-aedd-c82affc7d154';
        this.userPoolId = 'us-east-1_vX8VZrTKQ';
        this.clientId = '4t7m43e0pvmvc2v7rfv72dv69j';
        this.region = 'us-east-1';
        this.bucketName = 'video-course-bucket-047ad47c';
        
        this.cognitoIdentity = null;
        this.s3 = null;
        this.credentials = null;
    }

    async initialize() {
        try {
            // Load AWS SDK
            if (typeof AWS === 'undefined') {
                await this.loadAWSSDK();
            }

            AWS.config.region = this.region;
            
            // Get JWT token from localStorage or session
            const idToken = localStorage.getItem('idToken') || this.getTokenFromSession();
            
            if (!idToken) {
                console.log('No ID token found, user needs to login');
                return false;
            }

            // Configure Cognito Identity
            this.cognitoIdentity = new AWS.CognitoIdentity();
            
            // Get Identity ID
            const identityId = await this.getIdentityId(idToken);
            
            // Get AWS credentials
            this.credentials = await this.getCredentials(identityId, idToken);
            
            // Initialize S3 with credentials
            this.s3 = new AWS.S3({
                credentials: this.credentials,
                region: this.region
            });

            console.log('✅ AWS Identity Pool initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize AWS Identity Pool:', error);
            return false;
        }
    }

    async loadAWSSDK() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://sdk.amazonaws.com/js/aws-sdk-2.1.24.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    getTokenFromSession() {
        // Try to get token from various sources
        const token = sessionStorage.getItem('idToken') || 
                     localStorage.getItem('accessToken') ||
                     this.extractTokenFromCookie();
        return token;
    }

    extractTokenFromCookie() {
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'idToken' || name === 'accessToken') {
                return decodeURIComponent(value);
            }
        }
        return null;
    }

    async getIdentityId(idToken) {
        const params = {
            IdentityPoolId: this.identityPoolId,
            Logins: {
                [`cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`]: idToken
            }
        };

        const result = await this.cognitoIdentity.getId(params).promise();
        return result.IdentityId;
    }

    async getCredentials(identityId, idToken) {
        const params = {
            IdentityId: identityId,
            Logins: {
                [`cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`]: idToken
            }
        };

        const result = await this.cognitoIdentity.getCredentialsForIdentity(params).promise();
        
        return new AWS.Credentials({
            accessKeyId: result.Credentials.AccessKeyId,
            secretAccessKey: result.Credentials.SecretKey,
            sessionToken: result.Credentials.SessionToken
        });
    }

    async generateSignedUrl(videoKey, expiresIn = 3600) {
        if (!this.s3) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Failed to initialize AWS Identity Pool');
            }
        }

        const params = {
            Bucket: this.bucketName,
            Key: videoKey,
            Expires: expiresIn
        };

        return this.s3.getSignedUrl('getObject', params);
    }

    async uploadFile(file, key, onProgress) {
        if (!this.s3) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Failed to initialize AWS Identity Pool');
            }
        }

        const params = {
            Bucket: this.bucketName,
            Key: key,
            Body: file,
            ContentType: file.type
        };

        const upload = this.s3.upload(params);
        
        if (onProgress) {
            upload.on('httpUploadProgress', onProgress);
        }

        return upload.promise();
    }

    async listVideos(coursePrefix) {
        if (!this.s3) {
            const initialized = await this.initialize();
            if (!initialized) {
                throw new Error('Failed to initialize AWS Identity Pool');
            }
        }

        const params = {
            Bucket: this.bucketName,
            Prefix: `videos/${coursePrefix}/`,
            MaxKeys: 1000
        };

        const result = await this.s3.listObjectsV2(params).promise();
        return result.Contents || [];
    }
}

// Global instance
window.awsIdentityPool = new AWSIdentityPool();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    await window.awsIdentityPool.initialize();
});

// Enhanced video player with Identity Pool
class SecureVideoPlayer {
    constructor(videoElement, videoKey) {
        this.videoElement = videoElement;
        this.videoKey = videoKey;
        this.retryCount = 0;
        this.maxRetries = 3;
    }

    async loadVideo() {
        try {
            console.log(`🎬 Loading video: ${this.videoKey}`);
            
            // Generate signed URL using Identity Pool
            const signedUrl = await window.awsIdentityPool.generateSignedUrl(this.videoKey);
            
            // Set video source
            this.videoElement.src = signedUrl;
            
            // Add error handling
            this.videoElement.onerror = () => this.handleVideoError();
            
            console.log('✅ Video loaded successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to load video:', error);
            return this.handleVideoError();
        }
    }

    async handleVideoError() {
        this.retryCount++;
        
        if (this.retryCount <= this.maxRetries) {
            console.log(`🔄 Retrying video load (${this.retryCount}/${this.maxRetries})`);
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * this.retryCount));
            
            // Reinitialize Identity Pool and retry
            await window.awsIdentityPool.initialize();
            return this.loadVideo();
        } else {
            console.error('❌ Max retries reached, video failed to load');
            this.showErrorMessage();
            return false;
        }
    }

    showErrorMessage() {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'video-error';
        errorDiv.innerHTML = `
            <div style="text-align: center; padding: 40px; background: #f5f5f7; border-radius: 12px;">
                <h3>Video Temporarily Unavailable</h3>
                <p>Please refresh the page or try again later.</p>
                <button onclick="location.reload()" style="margin-top: 16px; padding: 8px 16px; background: #007aff; color: white; border: none; border-radius: 8px;">
                    Refresh Page
                </button>
            </div>
        `;
        
        this.videoElement.parentNode.insertBefore(errorDiv, this.videoElement.nextSibling);
        this.videoElement.style.display = 'none';
    }
}

// Helper function to initialize video with Identity Pool
window.initSecureVideo = function(videoElement, videoKey) {
    const player = new SecureVideoPlayer(videoElement, videoKey);
    player.loadVideo();
    return player;
};