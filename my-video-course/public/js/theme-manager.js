// Theme Manager - Handles dark/light mode switching
class ThemeManager {
  constructor() {
    this.init();
  }

  init() {
    // Apply theme immediately to prevent FOUC
    this.applyTheme();
    
    // Set up theme toggle listeners
    document.addEventListener('DOMContentLoaded', () => {
      this.setupToggle();
    });
  }

  applyTheme() {
    const theme = this.getTheme();
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }

  getTheme() {
    const stored = localStorage.getItem('theme');
    if (stored) return stored;
    
    // Default to system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  setTheme(theme) {
    if (theme === 'system') {
      localStorage.removeItem('theme');
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', systemTheme === 'dark');
    } else {
      localStorage.setItem('theme', theme);
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
    
    this.updateToggleIcon();
  }

  setupToggle() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    this.updateToggleIcon();
    
    toggle.addEventListener('click', () => {
      const current = this.getTheme();
      const next = current === 'dark' ? 'light' : 'dark';
      this.setTheme(next);
    });

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        document.documentElement.classList.toggle('dark', e.matches);
        this.updateToggleIcon();
      }
    });
  }

  updateToggleIcon() {
    const toggle = document.getElementById('theme-toggle');
    const icon = toggle?.querySelector('i');
    if (!icon) return;

    const isDark = document.documentElement.classList.contains('dark');
    icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    toggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  }
}

// Initialize theme manager immediately
new ThemeManager();