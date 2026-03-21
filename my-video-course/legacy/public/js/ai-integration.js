// Global AI service integration for all videos and courses
class AIIntegration {
  constructor() {
    this.status = 'unknown';
    this.init();
  }

  async init() {
    await this.checkStatus();
    this.setupGlobalHandlers();
  }

  async checkStatus() {
    try {
      const response = await fetch('/api/ai/status');
      const data = await response.json();
      this.status = data.status;
      console.log('AI Service:', data.status);
    } catch (error) {
      this.status = 'unavailable';
      console.warn('AI service unavailable:', error.message);
    }
  }

  setupGlobalHandlers() {
    // Add AI indicators to all video elements
    document.querySelectorAll('[data-video-id]').forEach(element => {
      if (this.status === 'available') {
        element.classList.add('ai-enabled');
      }
    });
  }

  async generateContent(prompt, options = {}) {
    if (this.status !== 'available') {
      throw new Error('AI service not available');
    }
    
    const response = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, ...options })
    });
    
    if (!response.ok) throw new Error('AI generation failed');
    return response.json();
  }
}

// Initialize global AI integration
window.aiIntegration = new AIIntegration();