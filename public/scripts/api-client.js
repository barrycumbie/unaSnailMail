/**
 * UNA SnailMail API Client
 * Handles all backend API communications
 */
class ApiClient {
  constructor() {
    this.baseUrl = window.location.origin + '/api';
    this.token = localStorage.getItem('auth_token');
    this.user = JSON.parse(localStorage.getItem('user') || 'null');
  }

  // Set authorization token
  setAuth(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem('auth_token', token);
    localStorage.setItem('user', JSON.stringify(user));
  }

  // Clear authorization
  clearAuth() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
  }

  // Make authenticated request
  async request(endpoint, options = {}) {
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    if (this.token) {
      config.headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  // Authentication endpoints
  async demoLogin(demoCode = null) {
    const response = await this.request('/auth/demo/login', {
      method: 'POST',
      body: demoCode ? { demoCode } : {}
    });
    return response;
  }

  async recipientLogin(email, password) {
    const response = await this.request('/auth/recipient/login', {
      method: 'POST',
      body: { email, password }
    });
    return response;
  }

  async delivererLogin(email, password) {
    const response = await this.request('/auth/deliverer/login', {
      method: 'POST',
      body: { email, password }
    });
    return response;
  }

  // Mail endpoints
  async searchMail(params = {}) {
    const query = new URLSearchParams(params).toString();
    return await this.request(`/mail?${query}`);
  }

  async scanMail(mailData) {
    return await this.request('/mail/scan', {
      method: 'POST',
      body: mailData
    });
  }

  async updateMailStatus(mailId, status, notes = '') {
    return await this.request(`/mail/${mailId}/status`, {
      method: 'PATCH',
      body: { status, notes }
    });
  }

  async getMailStats() {
    return await this.request('/mail/stats/overview');
  }

  // Carrier tracking endpoints
  async trackWithCarrier(trackingNumber, carrier = null) {
    const query = carrier ? `?carrier=${carrier}` : '';
    return await this.request(`/mail/carriers/track/${trackingNumber}${query}`);
  }

  async validateTrackingNumber(trackingNumber, carrier = null) {
    const params = new URLSearchParams({ trackingNumber });
    if (carrier) params.set('carrier', carrier);
    return await this.request(`/mail/carriers/validate?${params.toString()}`);
  }

  async getCarrierStatus() {
    return await this.request('/mail/carriers/status');
  }

  async bulkTrackPackages(packages) {
    return await this.request('/mail/carriers/bulk-track', {
      method: 'POST',
      body: { packages }
    });
  }

  async refreshAllTracking() {
    return await this.request('/mail/carriers/refresh-all', {
      method: 'POST'
    });
  }

  // User endpoints
  async getUserProfile() {
    return await this.request('/users/profile');
  }

  async getUserActivity() {
    return await this.request('/users/activity');
  }

  // Dashboard endpoints
  async getDashboardStats() {
    return await this.request('/dashboard/stats');
  }

  async getRecentActivity() {
    return await this.request('/dashboard/activity');
  }

  // Public tracking (no auth required)
  async publicTrack(trackingNumber) {
    return await this.request(`/mail/track/${trackingNumber}`);
  }
}

// Global API client instance
window.apiClient = new ApiClient();