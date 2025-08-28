// ✅ API Utility for Bearer Token Authentication
class ApiClient {
  static getToken() {
    return localStorage.getItem('authToken');
  }

  static getUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }

  static isAuthenticated() {
    return !!this.getToken();
  }

  static logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = '/api/auth/login';
  }

  // ✅ Make authenticated API requests with Bearer token
  static async request(url, options = {}) {
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

  static async get(url, options = {}) {
    return this.request(url, { ...options, method: 'GET' });
  }

  static async post(url, data, options = {}) {
    return this.request(url, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  static async put(url, data, options = {}) {
    return this.request(url, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  static async delete(url, options = {}) {
    return this.request(url, { ...options, method: 'DELETE' });
  }
}

window.ApiClient = ApiClient;