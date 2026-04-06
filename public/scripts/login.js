/**
 * Login Page Functionality
 * Handles authentication for recipients, deliverers, and demo users
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize page
  await initializePage();
  setupEventListeners();
});

async function initializePage() {
  // Check if already logged in
  if (apiClient.token) {
    window.location.href = 'dashboard.html';
    return;
  }

  // Detect environment and backend status
  await detectEnvironment();
  
  // Auto-fill demo form if localhost
  if (window.location.hostname === 'localhost') {
    document.getElementById('demo-code').value = 'LOCALHOST';
    document.querySelector('.demo-info').style.display = 'block';
  }
}

async function detectEnvironment() {
  const envElement = document.getElementById('env-detection');
  const backendElement = document.getElementById('backend-status');
  
  // Detect environment
  const isLocalhost = window.location.hostname === 'localhost';
  envElement.textContent = isLocalhost ? '🏠 Localhost (Dev)' : '🌐 Production';
  
  // Check backend connectivity
  try {
    const response = await fetch('/api/mail/carriers/status');
    if (response.ok) {
      backendElement.textContent = '✅ Connected';
      backendElement.className = 'status-success';
    } else {
      backendElement.textContent = '⚠️ Issues Detected';
      backendElement.className = 'status-warning';
    }
  } catch (error) {
    backendElement.textContent = '❌ Offline';
    backendElement.className = 'status-error';
  }
}

function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Demo code chips
  document.querySelectorAll('.demo-code-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('demo-code').value = chip.dataset.code;
    });
  });

  // Login forms
  document.getElementById('recipientLoginForm').addEventListener('submit', handleRecipientLogin);
  document.getElementById('delivererLoginForm').addEventListener('submit', handleDelivererLogin);
  document.getElementById('demoLoginForm').addEventListener('submit', handleDemoLogin);
}

function switchTab(tabName) {
  // Update active tab button
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update active form
  document.querySelectorAll('.login-form').forEach(form => {
    form.classList.toggle('active', form.id === `${tabName}-form`);
  });
}

async function handleRecipientLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('recipient-email').value;
  const password = document.getElementById('recipient-password').value;
  
  setStatus('🔐 Logging in...', 'loading');
  
  try {
    const response = await apiClient.recipientLogin(email, password);
    
    if (response.success) {
      apiClient.setAuth(response.data.accessToken, response.data.user);
      setStatus('✅ Login successful! Redirecting...', 'success');
      
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1000);
    } else {
      setStatus(`❌ ${response.message}`, 'error');
    }
  } catch (error) {
    setStatus(`❌ Login failed: ${error.message}`, 'error');
  }
}

async function handleDelivererLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('deliverer-email').value;
  const password = document.getElementById('deliverer-password').value;
  
  setStatus('🔐 Authenticating staff...', 'loading');
  
  try {
    const response = await apiClient.delivererLogin(email, password);
    
    if (response.success) {
      apiClient.setAuth(response.data.accessToken, response.data.user);
      setStatus('✅ Staff login successful!', 'success');
      
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1000);
    } else {
      setStatus(`❌ ${response.message}`, 'error');
    }
  } catch (error) {
    setStatus(`❌ Staff login failed: ${error.message}`, 'error');
  }
}

async function handleDemoLogin(e) {
  e.preventDefault();
  
  const demoCode = document.getElementById('demo-code').value.trim();
  
  setStatus('🎭 Activating demo mode...', 'loading');
  
  try {
    const response = await apiClient.demoLogin(demoCode || null);
    
    if (response.success) {
      apiClient.setAuth(response.data.accessToken, response.data.user);
      
      // Show enhanced message for localhost
      const message = response.data.user.isLocalhost 
        ? '🏠 Enhanced localhost demo activated!' 
        : '🎭 Demo mode activated!';
        
      setStatus(`✅ ${message}`, 'success');
      
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1000);
    } else {
      setStatus(`❌ ${response.message}`, 'error');
    }
  } catch (error) {
    setStatus(`❌ Demo activation failed: ${error.message}`, 'error');
  }
}

function setStatus(message, type) {
  const statusEl = document.getElementById('login-status');
  statusEl.textContent = message;
  statusEl.className = `status-message status-${type}`;
  
  // Auto-clear success/error messages after 5 seconds
  if (type !== 'loading') {
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'status-message';
    }, 5000);
  }
}

// Auto-demo for localhost development
if (window.location.hostname === 'localhost' && window.location.search.includes('auto-demo')) {
  setTimeout(() => {
    switchTab('demo');
    handleDemoLogin({ preventDefault: () => {} });
  }, 500);
}