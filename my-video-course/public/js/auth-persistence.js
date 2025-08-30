// Auto-attach JWT token to requests for persistent login
(function() {
    const originalFetch = window.fetch;
    
    window.fetch = function(url, options = {}) {
        const token = localStorage.getItem('accessToken');
        
        if (token && !options.headers) {
            options.headers = {};
        }
        
        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }
        
        return originalFetch(url, options);
    };
    
    // Auto-logout on token expiry
    function checkTokenExpiry() {
        const token = localStorage.getItem('accessToken');
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                const now = Date.now() / 1000;
                
                if (payload.exp && payload.exp < now) {
                    console.log('Token expired, logging out...');
                    localStorage.removeItem('accessToken');
                    localStorage.removeItem('user');
                    localStorage.removeItem('selectedRole');
                    window.location.href = '/login';
                }
            } catch (error) {
                console.error('Token validation error:', error);
            }
        }
    }
    
    // Only check token expiry if not on login/signup pages
    if (!window.location.pathname.match(/\/(login|signup|forgot-password)/)) {
        setInterval(checkTokenExpiry, 5 * 60 * 1000);
        checkTokenExpiry();
    }
})();