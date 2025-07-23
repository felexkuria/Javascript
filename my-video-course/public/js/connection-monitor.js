// Connection Monitor
class ConnectionMonitor {
  constructor(options = {}) {
    this.options = {
      checkInterval: options.checkInterval || 30000, // Check every 30 seconds by default
      onOnline: options.onOnline || (() => {}),
      onOffline: options.onOffline || (() => {}),
      pingUrl: options.pingUrl || '/api/ping',
      timeout: options.timeout || 5000
    };
    
    this.isOnline = navigator.onLine;
    this.checkingConnection = false;
    this.intervalId = null;
    
    // Bind methods
    this.checkConnection = this.checkConnection.bind(this);
    this.handleOnline = this.handleOnline.bind(this);
    this.handleOffline = this.handleOffline.bind(this);
    
    // Add event listeners
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }
  
  start() {
    // Initial check
    this.checkConnection();
    
    // Set up interval
    this.intervalId = setInterval(this.checkConnection, this.options.checkInterval);
    console.log('Connection monitor started');
    return this;
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    // Remove event listeners
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    
    console.log('Connection monitor stopped');
    return this;
  }
  
  async checkConnection() {
    if (this.checkingConnection) return;
    
    this.checkingConnection = true;
    
    try {
      // First check navigator.onLine
      if (!navigator.onLine) {
        if (this.isOnline) {
          this.isOnline = false;
          this.options.onOffline();
        }
        this.checkingConnection = false;
        return;
      }
      
      // Then try to ping the server
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);
      
      const response = await fetch(this.options.pingUrl, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        if (!this.isOnline) {
          this.isOnline = true;
          this.options.onOnline();
        }
      } else {
        if (this.isOnline) {
          this.isOnline = false;
          this.options.onOffline();
        }
      }
    } catch (error) {
      console.log('Connection check failed:', error.message);
      if (this.isOnline) {
        this.isOnline = false;
        this.options.onOffline();
      }
    } finally {
      this.checkingConnection = false;
    }
  }
  
  handleOnline() {
    console.log('Browser reports online');
    this.checkConnection();
  }
  
  handleOffline() {
    console.log('Browser reports offline');
    if (this.isOnline) {
      this.isOnline = false;
      this.options.onOffline();
    }
  }
}

// Export for use in other scripts
window.ConnectionMonitor = ConnectionMonitor;