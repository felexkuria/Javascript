/**
 * auth-persistence.js
 * Ensures authentication state is persisted across page loads and tabs.
 */

(function() {
    const AUTH_CHECK_INTERVAL = 30000; // 30 seconds

    function checkAuth() {
        const user = localStorage.getItem('user');
        const token = localStorage.getItem('accessToken');
        
        // If we are on a protected page but have no auth, redirect to login
        const protectedPaths = ['/dashboard', '/teacher/dashboard', '/learning', '/course/v2'];
        const currentPath = window.location.pathname;
        
        const isProtected = protectedPaths.some(path => currentPath.startsWith(path));
        
        if (isProtected && (!user || !token)) {
            console.warn('🔐 Auth persistence: Session missing, redirecting to login');
            window.location.href = '/login';
        }
    }

    // Sync localStorage across tabs
    window.addEventListener('storage', (e) => {
        if (e.key === 'accessToken' && !e.newValue) {
            window.location.href = '/login';
        }
    });

    // Run initial check
    document.addEventListener('DOMContentLoaded', checkAuth);

    // Periodic validation
    setInterval(checkAuth, AUTH_CHECK_INTERVAL);
})();
