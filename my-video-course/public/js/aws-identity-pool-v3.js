// AWS Identity Pool Integration - SDK v3 Compatible
class AWSIdentityPoolV3 {
    constructor() {
        this.identityPoolId = 'us-east-1:437744b6-640c-4b25-aedd-c82affc7d154';
        this.userPoolId = 'us-east-1_vX8VZrTKQ';
        this.clientId = '4t7m43e0pvmvc2v7rfv72dv69j';
        this.region = 'us-east-1';
        this.bucketName = 'video-course-bucket-047ad47c';
        
        this.credentials = null;
    }

    async initialize() {
        try {
            console.log('🔧 Initializing AWS Identity Pool v3...');
            
            // Get JWT token from session/localStorage
            const idToken = this.getTokenFromSession();
            
            if (!idToken) {
                console.log('❌ No ID token found, using backend fallback');
                return false;
            }

            // Use fetch API to get temporary credentials
            const credentials = await this.getTemporaryCredentials(idToken);
            
            if (credentials) {
                this.credentials = credentials;
                console.log('✅ AWS Identity Pool v3 initialized successfully');
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('❌ Failed to initialize AWS Identity Pool v3:', error);
            return false;
        }
    }

    getTokenFromSession() {
        // Try multiple sources for the token
        return localStorage.getItem('idToken') || 
               sessionStorage.getItem('idToken') ||
               localStorage.getItem('accessToken') ||
               this.extractTokenFromCookie();
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

    async getTemporaryCredentials(idToken) {
        try {
            // Use AWS STS AssumeRoleWithWebIdentity via API
            const response = await fetch('/api/auth/get-temp-credentials', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    idToken: idToken,
                    identityPoolId: this.identityPoolId
                })
            });

            if (response.ok) {
                const data = await response.json();
                return data.credentials;
            }
            
            return null;
        } catch (error) {
            console.error('Error getting temporary credentials:', error);
            return null;
        }
    }

    async generateSignedUrl(videoKey, expiresIn = 3600) {
        try {
            if (!this.credentials) {
                const initialized = await this.initialize();
                if (!initialized) {
                    throw new Error('Failed to initialize AWS Identity Pool');
                }
            }

            // Use backend API to generate signed URL with user credentials
            const response = await fetch('/api/videos/signed-url', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    videoKey: videoKey,
                    expiresIn: expiresIn
                })
            });

            if (response.ok) {
                const data = await response.json();
                return data.signedUrl;
            }
            
            throw new Error('Failed to generate signed URL');
        } catch (error) {
            console.error('Error generating signed URL:', error);
            throw error;
        }
    }

    async uploadFile(file, key, onProgress) {
        try {
            if (!this.credentials) {
                const initialized = await this.initialize();
                if (!initialized) {
                    throw new Error('Failed to initialize AWS Identity Pool');
                }
            }

            // Use backend API for upload with progress tracking
            const formData = new FormData();
            formData.append('file', file);
            formData.append('key', key);

            const xhr = new XMLHttpRequest();
            
            return new Promise((resolve, reject) => {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable && onProgress) {
                        onProgress({
                            loaded: e.loaded,
                            total: e.total,
                            percentage: (e.loaded / e.total) * 100
                        });
                    }
                });

                xhr.addEventListener('load', () => {
                    if (xhr.status === 200) {
                        resolve(JSON.parse(xhr.responseText));
                    } else {
                        reject(new Error(`Upload failed: ${xhr.status}`));
                    }
                });

                xhr.addEventListener('error', () => {
                    reject(new Error('Upload failed'));
                });

                xhr.open('POST', '/api/videos/upload-direct');
                xhr.send(formData);
            });
        } catch (error) {
            console.error('Error uploading file:', error);
            throw error;
        }
    }
}

// Enhanced video player with fallback
class SecureVideoPlayerV3 {
    constructor(videoElement, videoKey) {
        this.videoElement = videoElement;
        this.videoKey = videoKey;
        this.retryCount = 0;
        this.maxRetries = 2;
    }

    async loadVideo() {
        try {
            console.log(`🎬 Loading video: ${this.videoKey}`);
            
            // Try Identity Pool first
            if (window.awsIdentityPoolV3) {
                try {
                    const signedUrl = await window.awsIdentityPoolV3.generateSignedUrl(this.videoKey);
                    this.videoElement.src = signedUrl;
                    console.log('✅ Video loaded with Identity Pool v3');
                    return true;
                } catch (error) {
                    console.log('⚠️ Identity Pool failed, trying backend fallback');
                }
            }
            
            // Fallback to backend-generated URL
            const response = await fetch(`/api/videos/stream-url`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    videoKey: this.videoKey
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.videoElement.src = data.streamUrl;
                console.log('✅ Video loaded with backend fallback');
                return true;
            }
            
            throw new Error('All video loading methods failed');
            
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

// Global instance
window.awsIdentityPoolV3 = new AWSIdentityPoolV3();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    await window.awsIdentityPoolV3.initialize();
});

// Helper function to initialize video with Identity Pool v3
window.initSecureVideoV3 = function(videoElement, videoKey) {
    const player = new SecureVideoPlayerV3(videoElement, videoKey);
    player.loadVideo();
    return player;
};