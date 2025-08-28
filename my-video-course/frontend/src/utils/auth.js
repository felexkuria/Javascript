// Auth utility for making authenticated requests
class AuthHelper {
  static getToken() {
    return localStorage.getItem('authToken');
  }

  static getUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }

  static async apiRequest(url, options = {}) {
    const token = this.getToken();
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (response.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/api/auth/login';
      return;
    }

    return response;
  }

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
}

window.AuthHelper = AuthHelper;