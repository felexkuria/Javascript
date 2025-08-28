/**
 * Frontend localStorage Export Utility
 * 
 * This script simulates extracting data from localStorage in the browser.
 * Run this in the browser console to export localStorage data as JSON.
 */

function exportLocalStorageData() {
  const data = {
    courses: {},
    userProgress: {},
    gamification: {},
    metadata: {
      exportedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    }
  };

  // Extract course/video data
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const value = localStorage.getItem(key);
    
    try {
      const parsedValue = JSON.parse(value);
      
      // Identify course data (arrays of video objects)
      if (Array.isArray(parsedValue) && parsedValue.length > 0 && parsedValue[0]._id) {
        data.courses[key] = parsedValue;
      }
      // Identify user progress data
      else if (typeof parsedValue === 'object' && parsedValue.userId) {
        data.userProgress[key] = parsedValue;
      }
      // Identify gamification data
      else if (typeof parsedValue === 'object' && (parsedValue.achievements || parsedValue.userStats)) {
        data.gamification[key] = parsedValue;
      }
    } catch (e) {
      // Store non-JSON values as strings
      data[key] = value;
    }
  }

  return data;
}

function downloadLocalStorageData() {
  const data = exportLocalStorageData();
  const jsonString = JSON.stringify(data, null, 2);
  
  // Create download link
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `localStorage-export-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log('✅ localStorage data exported successfully');
  return data;
}

// API endpoint to send data to backend
async function sendLocalStorageToBackend() {
  const data = exportLocalStorageData();
  
  try {
    const response = await fetch('/api/migrate/localStorage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Data sent to backend successfully:', result);
      return result;
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.error('❌ Failed to send data to backend:', error);
    throw error;
  }
}

// Usage instructions
console.log(`
📋 localStorage Export Utility
=============================

To export your localStorage data:

1. Download as file:
   downloadLocalStorageData()

2. Send to backend API:
   sendLocalStorageToBackend()

3. Just view the data:
   exportLocalStorageData()
`);

// Export functions for use
window.exportLocalStorageData = exportLocalStorageData;
window.downloadLocalStorageData = downloadLocalStorageData;
window.sendLocalStorageToBackend = sendLocalStorageToBackend;