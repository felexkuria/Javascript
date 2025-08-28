// ✅ Auth Helper for API Requests with Bearer Token
class AuthHelper {
  static getToken() {
    return localStorage.getItem('accessToken') || localStorage.getItem('cognitoToken');
  }

  static getIdToken() {
    return localStorage.getItem('idToken');
  }

  static isAuthenticated() {
    return !!this.getToken();
  }

  static logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('idToken');
    localStorage.removeItem('cognitoToken');
    localStorage.removeItem('userId');
    window.location.href = '/api/auth/login';
  }

  // ✅ Make authenticated API requests with Bearer token
  static async apiRequest(url, options = {}) {
    const token = this.getToken();
    
    if (!token) {
      this.logout();
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (response.status === 401) {
        console.warn('Token expired, redirecting to login');
        this.logout();
        return;
      }

      return response;
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // ✅ Convenience methods for common HTTP verbs
  static async get(url, options = {}) {
    return this.apiRequest(url, { ...options, method: 'GET' });
  }

  static async post(url, data, options = {}) {
    return this.apiRequest(url, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  static async put(url, data, options = {}) {
    return this.apiRequest(url, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  static async delete(url, options = {}) {
    return this.apiRequest(url, { ...options, method: 'DELETE' });
  }
}

// ✅ Auto-redirect to login if not authenticated on protected pages
if (window.location.pathname !== '/api/auth/login' && !AuthHelper.isAuthenticated()) {
  AuthHelper.logout();
}

window.AuthHelper = AuthHelper;