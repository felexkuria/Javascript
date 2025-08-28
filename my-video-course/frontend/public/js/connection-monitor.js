// Connection monitor class
class ConnectionMonitor {
  constructor(options) {
    this.checkInterval = options.checkInterval || 30000;
    this.onOnline = options.onOnline || (() => {});
    this.onOffline = options.onOffline || (() => {});
    this.isOnline = navigator.onLine;
  }
  
  start() {
    // Set up event listeners for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.onOnline();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.onOffline();
    });
    
    // Initial check
    if (this.isOnline) {
      this.onOnline();
    } else {
      this.onOffline();
    }
    
    // Start periodic checking
    this.intervalId = setInterval(() => this.checkConnection(), this.checkInterval);
    
    return this;
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
  
  async checkConnection() {
    try {
      const response = await fetch('/api/ping', { method: 'HEAD' });
      if (response.ok && !this.isOnline) {
        this.isOnline = true;
        this.onOnline();
      } else if (!response.ok && this.isOnline) {
        this.isOnline = false;
        this.onOffline();
      }
    } catch (err) {
      if (this.isOnline) {
        this.isOnline = false;
        this.onOffline();
      }
    }
  }
}