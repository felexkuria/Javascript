// Add token to all requests and check login status
document.addEventListener('DOMContentLoaded', function() {
    // Get token from localStorage or cookie for faster loading
    let token = localStorage.getItem('cognitoToken');
    if (!token) {
        // Try to get from cookie
        const cookies = document.cookie.split(';');
        const cognitoCookie = cookies.find(c => c.trim().startsWith('cognitoToken='));
        if (cognitoCookie) {
            token = cognitoCookie.split('=')[1];
            localStorage.setItem('cognitoToken', token); // Store for faster access
        }
    }
    
    // Check if user is already logged in
    if (token && window.location.pathname === '/api/auth/login') {
        window.location.href = '/dashboard';
        return;
    }
    
    if (token) {
        // Override fetch to include token
        const originalFetch = window.fetch;
        window.fetch = function(url, options = {}) {
            options.headers = options.headers || {};
            options.headers['Authorization'] = `Bearer ${token}`;
            return originalFetch(url, options);
        };
        
        // Override XMLHttpRequest
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
            this.addEventListener('readystatechange', function() {
                if (this.readyState === 1) {
                    this.setRequestHeader('Authorization', `Bearer ${token}`);
                }
            });
            return originalOpen.apply(this, arguments);
        };
    }
    
    // Auto-redirect from dashboard if not logged in
    if (!token && (window.location.pathname === '/dashboard' || window.location.pathname === '/')) {
        window.location.href = '/api/auth/login';
    }
    
    // Logout functionality
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function() {
            try {
                await fetch('/api/auth/logout', { method: 'POST' });
                localStorage.removeItem('cognitoToken');
                localStorage.removeItem('userId');
                window.location.href = '/api/auth/login';
            } catch (error) {
                console.error('Logout failed:', error);
                // Force logout anyway
                localStorage.removeItem('cognitoToken');
                localStorage.removeItem('userId');
                window.location.href = '/api/auth/login';
            }
        });
    }
});