/**
 * Dashboard Functionality
 * Handles all dashboard operations and API integrations
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Check authentication
  if (!apiClient.token) {
    window.location.href = 'login.html';
    return;
  }

  await initializeDashboard();
  setupEventListeners();
});

async function initializeDashboard() {
  // Display user info
  displayUserInfo();
  
  // Show/hide admin panel based on permissions
  toggleAdminAccess();
  
  // Load initial data
  await loadDashboardStats();
  await loadCarrierStatus();
  await loadRecentActivity();
}

function displayUserInfo() {
  const welcomeEl = document.getElementById('user-welcome');
  const user = apiClient.user;
  
  if (user) {
    const userType = user.userType === 'deliverer' ? '📦 Staff' : '👨‍🎓 Student';
    const level = user.level ? ` (Level ${user.level})` : '';
    const demo = user.isDemoUser ? ' 🎭' : '';
    
    welcomeEl.textContent = `${userType} ${user.firstName || 'User'}${level}${demo}`;
  }
}

function setupEventListeners() {
  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', logout);

  // Tracking
  document.getElementById('track-btn').addEventListener('click', trackPackage);
  document.querySelectorAll('.sample-number').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('track-number').value = btn.dataset.number;
      document.getElementById('track-carrier').value = btn.dataset.carrier;
      trackPackage();
    });
  });

  // Mail scanning
  document.getElementById('scan-mail-form').addEventListener('submit', scanMail);

  // Mail search
  document.getElementById('search-btn').addEventListener('click', searchMail);

  // Carrier tools
  document.getElementById('validate-btn').addEventListener('click', validateTrackingNumber);
  document.getElementById('bulk-track-btn').addEventListener('click', bulkTrackPackages);
  document.getElementById('refresh-all-btn').addEventListener('click', refreshAllTracking);

  // Internal packages
  document.getElementById('generate-internal-form').addEventListener('submit', generateInternalPackage);
  document.getElementById('bulk-generate-btn').addEventListener('click', generateBulkPackages);
  document.getElementById('validate-internal-btn').addEventListener('click', validateInternalTracking);
  document.getElementById('load-stats-btn').addEventListener('click', loadInternalStats);

  // Admin panel event listeners
  setupAdminEventListeners();
}

function switchSection(sectionName) {
  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === sectionName);
  });

  // Update sections
  document.querySelectorAll('.dashboard-section').forEach(section => {
    section.classList.toggle('active', section.id === `${sectionName}-section`);
  });
}

async function loadDashboardStats() {
  try {
    const response = await apiClient.getMailStats();
    if (response.success) {
      const stats = response.data;
      document.getElementById('total-mail').textContent = stats.totalMail || 0;
      document.getElementById('awaiting-pickup').textContent = stats.awaitingPickup || 0;
      document.getElementById('in-transit').textContent = stats.inTransit || 0;
      document.getElementById('delivered').textContent = stats.delivered || 0;
    }
  } catch (error) {
    console.error('Failed to load stats:', error);
    // Show demo stats
    document.getElementById('total-mail').textContent = '42';
    document.getElementById('awaiting-pickup').textContent = '8';
    document.getElementById('in-transit').textContent = '15';
    document.getElementById('delivered').textContent = '19';
  }
}

async function loadCarrierStatus() {
  try {
    const response = await apiClient.getCarrierStatus();
    if (response.success) {
      displayCarrierStatus(response.data);
    }
  } catch (error) {
    console.error('Failed to load carrier status:', error);
    document.getElementById('carrier-status-grid').innerHTML = 
      '<p class="error">Failed to load carrier status</p>';
  }
}

function displayCarrierStatus(data) {
  const grid = document.getElementById('carrier-status-grid');
  
  const html = data.carriers.map(carrier => {
    const status = data.status[carrier.name];
    const statusIcon = status.available ? '✅' : '❌';
    const apiStatus = status.hasApiKey ? '🔑 API Keys' : '🎭 Demo Mode';
    
    return `
      <div class="carrier-status-card">
        <h4>${carrier.displayName} ${statusIcon}</h4>
        <p>${apiStatus}</p>
        <small>Last check: ${new Date(status.lastTest).toLocaleTimeString()}</small>
      </div>
    `;
  }).join('');
  
  grid.innerHTML = html;
}

async function loadRecentActivity() {
  // Demo activity data
  const demoActivity = [
    { action: '📦 Mail scanned', details: 'Package from Amazon for John Smith', time: '5 minutes ago' },
    { action: '🚚 Status updated', details: 'UPS package out for delivery', time: '15 minutes ago' },
    { action: '✅ Package delivered', details: 'USPS envelope to Mary Johnson', time: '1 hour ago' },
    { action: '🔍 Bulk tracking completed', details: '12 packages updated', time: '2 hours ago' }
  ];

  const activityHtml = demoActivity.map(activity => `
    <div class="activity-item">
      <div class="activity-action">${activity.action}</div>
      <div class="activity-details">${activity.details}</div>
      <div class="activity-time">${activity.time}</div>
    </div>
  `).join('');

  document.getElementById('recent-activity-list').innerHTML = activityHtml;
}

async function trackPackage() {
  const trackingNumber = document.getElementById('track-number').value.trim();
  const carrier = document.getElementById('track-carrier').value;
  
  if (!trackingNumber) {
    alert('Please enter a tracking number');
    return;
  }

  showLoading(true);
  
  try {
    const response = await apiClient.trackWithCarrier(trackingNumber, carrier);
    displayTrackingResult(response.data);
  } catch (error) {
    displayTrackingError(error.message);
  } finally {
    showLoading(false);
  }
}

function displayTrackingResult(result) {
  const resultDiv = document.getElementById('tracking-result');
  
  if (!result.success) {
    displayTrackingError(result.error || 'Tracking failed');
    return;
  }

  const statusIcons = {
    'AWAITING_PICKUP': '📦',
    'IN_TRANSIT': '🚚',
    'OUT_FOR_DELIVERY': '🚛',
    'DELIVERED': '✅',
    'EXCEPTION': '⚠️',
    'RETURNED': '↩️'
  };

  const eventsHtml = result.events?.map(event => `
    <div class="tracking-event">
      <div class="event-status">${statusIcons[event.status] || '📍'} ${event.status}</div>
      <div class="event-location">${event.location}</div>
      <div class="event-time">${new Date(event.timestamp).toLocaleString()}</div>
      <div class="event-description">${event.description}</div>
    </div>
  `).join('') || '';

  const html = `
    <div class="tracking-success">
      <h3>📦 Tracking Results</h3>
      <div class="tracking-header">
        <div class="tracking-info">
          <p><strong>Tracking #:</strong> ${result.trackingNumber}</p>
          <p><strong>Carrier:</strong> ${result.carrier}</p>
          <p><strong>Status:</strong> ${statusIcons[result.status] || '📍'} ${result.status}</p>
          <p><strong>Location:</strong> ${result.location || 'Unknown'}</p>
          ${result.estimatedDelivery ? `<p><strong>Est. Delivery:</strong> ${new Date(result.estimatedDelivery).toLocaleDateString()}</p>` : ''}
        </div>
        <div class="tracking-actions">
          <a href="${result.trackingUrl}" target="_blank" class="btn-secondary">View on ${result.carrier}</a>
        </div>
      </div>
      
      <div class="tracking-timeline">
        <h4>📋 Tracking History</h4>
        ${eventsHtml}
      </div>
    </div>
  `;

  resultDiv.innerHTML = html;
  resultDiv.style.display = 'block';
}

function displayTrackingError(error) {
  const resultDiv = document.getElementById('tracking-result');
  resultDiv.innerHTML = `
    <div class="tracking-error">
      <h3>❌ Tracking Error</h3>
      <p>${error}</p>
    </div>
  `;
  resultDiv.style.display = 'block';
}

async function scanMail(e) {
  e.preventDefault();
  
  const mailData = {
    trackingNumber: document.getElementById('scan-tracking').value.trim(),
    carrier: document.getElementById('scan-carrier').value,
    type: document.getElementById('scan-type').value,
    recipientName: document.getElementById('scan-recipient').value.trim(),
    recipientEmail: document.getElementById('scan-email').value.trim(),
    notes: document.getElementById('scan-notes').value.trim()
  };

  if (!mailData.trackingNumber || !mailData.carrier || !mailData.type || !mailData.recipientName) {
    alert('Please fill in all required fields');
    return;
  }

  showLoading(true);
  
  try {
    const response = await apiClient.scanMail(mailData);
    
    if (response.success) {
      alert('✅ Mail item scanned successfully!');
      document.getElementById('scan-mail-form').reset();
      await loadDashboardStats(); // Refresh stats
    } else {
      alert(`❌ Scan failed: ${response.message}`);
    }
  } catch (error) {
    alert(`❌ Scan error: ${error.message}`);
  } finally {
    showLoading(false);
  }
}

async function searchMail() {
  const query = document.getElementById('search-query').value.trim();
  const status = document.getElementById('search-status').value;
  const carrier = document.getElementById('search-carrier').value;
  
  const params = {};
  if (query) params.q = query;
  if (status) params.status = status;
  if (carrier) params.carrier = carrier;

  showLoading(true);
  
  try {
    const response = await apiClient.searchMail(params);
    displaySearchResults(response.data);
  } catch (error) {
    document.getElementById('mail-results').innerHTML = `
      <div class="error">Search failed: ${error.message}</div>
    `;
  } finally {
    showLoading(false);
  }
}

function displaySearchResults(data) {
  const resultsDiv = document.getElementById('mail-results');
  
  if (!data.mailItems?.length) {
    resultsDiv.innerHTML = '<p>No mail items found matching your criteria.</p>';
    return;
  }

  const html = `
    <div class="search-results">
      <h4>Found ${data.mailItems.length} mail item(s)</h4>
      <div class="mail-grid">
        ${data.mailItems.map(mail => `
          <div class="mail-card">
            <h5>📦 ${mail.type}</h5>
            <p><strong>Tracking:</strong> ${mail.trackingNumber}</p>
            <p><strong>Carrier:</strong> ${mail.carrier}</p>
            <p><strong>Recipient:</strong> ${mail.recipientName}</p>
            <p><strong>Status:</strong> ${mail.status}</p>
            <p><strong>Scanned:</strong> ${new Date(mail.scanInDate).toLocaleDateString()}</p>
            ${mail.notes ? `<p><strong>Notes:</strong> ${mail.notes}</p>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;

  resultsDiv.innerHTML = html;
}

async function validateTrackingNumber() {
  const trackingNumber = document.getElementById('validate-number').value.trim();
  
  if (!trackingNumber) {
    alert('Please enter a tracking number');
    return;
  }

  try {
    const response = await apiClient.validateTrackingNumber(trackingNumber);
    
    const result = document.getElementById('validation-result');
    if (response.data.isValid) {
      result.innerHTML = `
        <div class="validation-success">
          ✅ Valid ${response.data.detectedCarrier || 'tracking number'}
          ${response.data.trackingUrl ? `<br><a href="${response.data.trackingUrl}" target="_blank">Track Online</a>` : ''}
        </div>
      `;
    } else {
      result.innerHTML = `<div class="validation-error">❌ Invalid tracking number format</div>`;
    }
  } catch (error) {
    document.getElementById('validation-result').innerHTML = 
      `<div class="validation-error">❌ Validation failed: ${error.message}</div>`;
  }
}

async function bulkTrackPackages() {
  const numbers = document.getElementById('bulk-numbers').value
    .split('\n')
    .map(n => n.trim())
    .filter(n => n.length > 0);
  
  if (numbers.length === 0) {
    alert('Please enter tracking numbers (one per line)');
    return;
  }

  if (numbers.length > 10) {
    alert('Maximum 10 tracking numbers allowed for demo');
    return;
  }

  showLoading(true);
  
  try {
    const packages = numbers.map(trackingNumber => ({ trackingNumber }));
    const response = await apiClient.bulkTrackPackages(packages);
    
    const resultsDiv = document.getElementById('bulk-results');
    const summary = response.data.summary;
    
    const resultsHtml = response.data.results.map(result => `
      <div class="bulk-result ${result.success ? 'success' : 'error'}">
        <strong>${result.trackingNumber}</strong>: 
        ${result.success ? 
          `${result.carrier} - ${result.status}` : 
          `❌ ${result.error}`}
      </div>
    `).join('');

    resultsDiv.innerHTML = `
      <div class="bulk-summary">
        📊 Bulk Tracking Complete: ${summary.successful}/${summary.total} successful
      </div>
      <div class="bulk-results-list">
        ${resultsHtml}
      </div>
    `;
  } catch (error) {
    document.getElementById('bulk-results').innerHTML = 
      `<div class="error">Bulk tracking failed: ${error.message}</div>`;
  } finally {
    showLoading(false);
  }
}

async function refreshAllTracking() {
  if (!confirm('This will refresh tracking for all active shipments. Continue?')) {
    return;
  }

  showLoading(true);
  
  try {
    const response = await apiClient.refreshAllTracking();
    
    const resultDiv = document.getElementById('refresh-result');
    const data = response.data;
    
    resultDiv.innerHTML = `
      <div class="refresh-success">
        ✅ Tracking refresh complete!<br>
        📊 Updated ${data.updated}/${data.total} shipments<br>
        ${data.errors > 0 ? `⚠️ ${data.errors} errors encountered` : ''}
      </div>
    `;
    
    // Refresh dashboard stats
    await loadDashboardStats();
  } catch (error) {
    document.getElementById('refresh-result').innerHTML = 
      `<div class="error">❌ Refresh failed: ${error.message}</div>`;
  } finally {
    showLoading(false);
  }
}

function showLoading(show) {
  document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

function logout() {
  if (confirm('Are you sure you want to logout?')) {
    apiClient.clearAuth();
    window.location.href = 'login.html';
  }
}

// === INTERNAL PACKAGE FUNCTIONS ===

async function generateInternalPackage(e) {
  e.preventDefault();
  showLoading(true);
  
  try {
    const formData = new FormData(e.target);
    const packageData = {
      type: formData.get('type'),
      priority: formData.get('priority'),
      fromLocation: formData.get('fromLocation'),
      toLocation: formData.get('toLocation'),
      recipientName: formData.get('recipientName'),
      recipientEmail: formData.get('recipientEmail'),
      senderName: formData.get('senderName'),
      department: formData.get('department'),
      isConfidential: formData.get('isConfidential') === 'on',
      deliveryAddress: {
        building: formData.get('building')
      },
      packageDetails: {
        type: 'PACKAGE',
        size: formData.get('size'),
        weight: parseFloat(formData.get('weight')) || null
      },
      specialInstructions: formData.get('specialInstructions')
    };

    const response = await fetch('/api/mail/internal/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiClient.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(packageData)
    });

    const result = await response.json();
    
    if (result.success) {
      const data = result.data;
      
      // Display success result
      document.getElementById('package-result').innerHTML = `
        <div class="success-result">
          <h4>✅ Package Generated Successfully!</h4>
          <div class="tracking-info">
            <strong>Tracking Number:</strong> 
            <code class="tracking-number">${data.trackingNumber}</code>
            <button onclick="copyToClipboard('${data.trackingNumber}')" class="copy-btn">📋 Copy</button>
          </div>
          
          <div class="package-details">
            <p><strong>Type:</strong> ${data.metadata.type}</p>
            <p><strong>Priority:</strong> ${data.metadata.priority.name}</p>
            <p><strong>From:</strong> ${data.metadata.fromLocation.name}</p>
            <p><strong>To:</strong> ${data.metadata.toLocation.name}</p>
            <p><strong>Expected Delivery:</strong> ${new Date(data.estimatedDelivery).toLocaleDateString()}</p>
            ${data.metadata.isConfidential ? '<p class="confidential">🔒 CONFIDENTIAL ITEM</p>' : ''}
          </div>
          
          <div class="action-buttons">
            <a href="/api/mail/internal/label/${data.trackingNumber}" target="_blank" class="btn-primary">
              🏷️ Download Label
            </a>
            <button onclick="trackPackage('${data.trackingNumber}')" class="btn-secondary">
              📦 Track Package
            </button>
          </div>
          
          ${data.qrCode ? `
            <div class="qr-code">
              <p><strong>QR Code:</strong></p>
              <img src="${data.qrCode}" alt="QR Code" style="max-width: 150px;">
            </div>
          ` : ''}
        </div>
      `;
      
      // Clear form
      e.target.reset();
      
      // Show success notification
      showNotification('Package generated successfully!', 'success');
      
    } else {
      throw new Error(result.message);
    }
    
  } catch (error) {
    document.getElementById('package-result').innerHTML = 
      `<div class="error">❌ Error: ${error.message}</div>`;
  } finally {
    showLoading(false);
  }
}

async function generateBulkPackages() {
  const input = document.getElementById('bulk-packages-input').value.trim();
  
  if (!input) {
    alert('Please enter package data');
    return;
  }

  showLoading(true);
  
  try {
    // Parse JSON lines
    const lines = input.split('\n').filter(line => line.trim());
    const packages = lines.map(line => JSON.parse(line.trim()));
    
    const response = await fetch('/api/mail/internal/bulk', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiClient.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ packages })
    });

    const result = await response.json();
    
    if (result.success) {
      const data = result.data;
      
      let html = `
        <div class="bulk-success">
          <h4>✅ Bulk Generation Complete!</h4>
          <p>Generated ${data.summary.successful}/${data.summary.total} packages successfully</p>
          
          <div class="bulk-results-list">
            <h5>Generated Packages:</h5>
            <ul>
      `;
      
      data.packages.forEach(pkg => {
        html += `
          <li>
            <code>${pkg.trackingNumber}</code>
            <a href="/api/mail/internal/label/${pkg.trackingNumber}" target="_blank">📄 Label</a>
            <button onclick="copyToClipboard('${pkg.trackingNumber}')">📋</button>
          </li>
        `;
      });
      
      html += '</ul></div>';
      
      if (data.errors.length > 0) {
        html += `
          <div class="bulk-errors">
            <h5>❌ Errors:</h5>
            <ul>
        `;
        data.errors.forEach(error => {
          html += `<li>Line ${error.index + 1}: ${error.error}</li>`;
        });
        html += '</ul></div>';
      }
      
      html += '</div>';
      document.getElementById('bulk-results').innerHTML = html;
      
      // Clear input
      document.getElementById('bulk-packages-input').value = '';
      
    } else {
      throw new Error(result.message);
    }
    
  } catch (error) {
    document.getElementById('bulk-results').innerHTML = 
      `<div class="error">❌ Bulk generation failed: ${error.message}</div>`;
  } finally {
    showLoading(false);
  }
}

async function validateInternalTracking() {
  const trackingNumber = document.getElementById('validate-internal-number').value.trim();
  
  if (!trackingNumber) {
    alert('Please enter a tracking number');
    return;
  }

  showLoading(true);
  
  try {
    const response = await fetch(`/api/mail/internal/validate?trackingNumber=${encodeURIComponent(trackingNumber)}`, {
      headers: {
        'Authorization': `Bearer ${apiClient.token}`
      }
    });

    const result = await response.json();
    
    const resultDiv = document.getElementById('validation-result');
    
    if (result.success) {
      const data = result.data;
      
      if (data.valid) {
        resultDiv.innerHTML = `
          <div class="validation-success">
            ✅ <strong>Valid UNA Internal Tracking Number</strong><br>
            <div class="tracking-breakdown">
              <p><strong>Prefix:</strong> ${data.components.prefix}</p>
              <p><strong>Type:</strong> ${data.components.type}</p>
              <p><strong>From Location:</strong> ${data.components.fromLocation}</p>
              <p><strong>To Location:</strong> ${data.components.toLocation}</p>
              <p><strong>Date:</strong> ${data.components.date}</p>
              <p><strong>Checksum:</strong> ✅ Valid</p>
            </div>
          </div>
        `;
      } else {
        resultDiv.innerHTML = `
          <div class="validation-error">
            ❌ <strong>Invalid Tracking Number</strong><br>
            <p>${data.error}</p>
          </div>
        `;
      }
    } else {
      throw new Error(result.message);
    }
    
  } catch (error) {
    document.getElementById('validation-result').innerHTML = 
      `<div class="error">❌ Validation failed: ${error.message}</div>`;
  } finally {
    showLoading(false);
  }
}

async function loadInternalStats() {
  const timeframe = document.getElementById('stats-timeframe').value;
  showLoading(true);
  
  try {
    const response = await fetch(`/api/mail/internal/stats?timeframe=${timeframe}`, {
      headers: {
        'Authorization': `Bearer ${apiClient.token}`
      }
    });

    const result = await response.json();
    
    if (result.success) {
      const data = result.data;
      
      let html = `
        <div class="stats-display-content">
          <h4>📊 Internal Package Statistics (${data.timeframe})</h4>
          
          <div class="stats-summary">
            <p><strong>Total Packages:</strong> ${data.total}</p>
            ${data.avgDeliveryTime ? `<p><strong>Avg Delivery Time:</strong> ${data.avgDeliveryTime.toFixed(1)} days</p>` : ''}
          </div>
          
          <div class="stats-breakdown">
            <div class="stat-section">
              <h5>📦 By Type:</h5>
              <ul>
      `;
      
      Object.entries(data.breakdown.byType).forEach(([type, count]) => {
        html += `<li>${type}: ${count}</li>`;
      });
      
      html += `
              </ul>
            </div>
            
            <div class="stat-section">
              <h5>📊 By Status:</h5>
              <ul>
      `;
      
      Object.entries(data.breakdown.byStatus).forEach(([status, count]) => {
        html += `<li>${status}: ${count}</li>`;
      });
      
      html += `
              </ul>
            </div>
            
            <div class="stat-section">
              <h5>⚡ By Priority:</h5>
              <ul>
      `;
      
      Object.entries(data.breakdown.byPriority).forEach(([priority, count]) => {
        html += `<li>Level ${priority}: ${count}</li>`;
      });
      
      html += `
              </ul>
            </div>
          </div>
        </div>
      `;
      
      document.getElementById('stats-result').innerHTML = html;
    } else {
      throw new Error(result.message);
    }
    
  } catch (error) {
    document.getElementById('stats-result').innerHTML = 
      `<div class="error">❌ Stats loading failed: ${error.message}</div>`;
  } finally {
    showLoading(false);
  }
}

// Helper functions
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showNotification('Copied to clipboard!', 'success');
  }).catch(() => {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showNotification('Copied to clipboard!', 'success');
  });
}

function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  // Style the notification
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  
  // Set background color based on type
  const colors = {
    success: '#28a745',
    error: '#dc3545',
    warning: '#ffc107',
    info: '#17a2b8'
  };
  notification.style.backgroundColor = colors[type] || colors.info;
  
  // Add animation keyframes if not already present
  if (!document.querySelector('#notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Add to DOM
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// === ADMIN PANEL FUNCTIONS ===

function toggleAdminAccess() {
  const user = apiClient.user;
  const adminNavBtn = document.getElementById('admin-nav-btn');
  
  // Show admin panel for Level 2+ deliverers (supervisors and admins)
  if (user && user.userType === 'deliverer' && user.level >= 2) {
    adminNavBtn.style.display = 'inline-block';
  } else {
    adminNavBtn.style.display = 'none';
  }
}

function setupAdminEventListeners() {
  // Admin tab navigation
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => switchAdminTab(tab.dataset.tab));
  });

  // Admin filters and actions
  const applyFiltersBtn = document.getElementById('apply-filters-btn');
  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener('click', loadFilteredPackages);
  }

  const clearFiltersBtn = document.getElementById('clear-filters-btn');
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', clearPackageFilters);
  }

  const loadIssuesBtn = document.getElementById('load-issues-btn');
  if (loadIssuesBtn) {
    loadIssuesBtn.addEventListener('click', loadIssues);
  }

  const loadAuditBtn = document.getElementById('load-audit-btn');
  if (loadAuditBtn) {
    loadAuditBtn.addEventListener('click', loadAuditTrail);
  }
}

function switchAdminTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  // Update tab content
  document.querySelectorAll('.admin-tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `admin-${tabName}-tab`);
  });

  // Load tab-specific data
  switch (tabName) {
    case 'overview':
      loadAdminOverview();
      break;
    case 'packages':
      loadAllPackages();
      break;
    case 'workers':
      loadWorkerPerformance();
      break;
    case 'issues':
      loadIssues();
      break;
    case 'audit':
      loadAuditTrail();
      break;
  }
}

async function loadAdminOverview() {
  try {
    showLoading(true);

    const response = await fetch('/api/admin/dashboard?timeframe=30d', {
      headers: {
        'Authorization': `Bearer ${apiClient.token}`
      }
    });

    const result = await response.json();

    if (result.success) {
      const data = result.data;
      
      // Update overview stats
      document.getElementById('admin-total-packages').textContent = data.overview[0]?.totalPackages || 0;
      document.getElementById('admin-active-workers').textContent = data.workers?.length || 0;
      document.getElementById('admin-open-issues').textContent = data.issues[0]?.openIssues || 0;
      
      const avgProcessing = data.overview[0]?.avgProcessingTime;
      document.getElementById('admin-avg-processing').textContent = 
        avgProcessing ? `${avgProcessing.toFixed(1)} days` : 'N/A';

      // Display top performers
      displayTopPerformers(data.performance?.topPerformers || []);
      
      // Display carrier performance
      displayCarrierPerformance(data.carriers || []);
      
      // Display recent activity
      displayRecentActivity(data.recentActivity || []);

    } else {
      throw new Error(result.message);
    }

  } catch (error) {
    console.error('Admin overview error:', error);
    showNotification('Failed to load admin overview', 'error');
  } finally {
    showLoading(false);
  }
}

function displayTopPerformers(performers) {
  const container = document.getElementById('top-performers-chart');
  
  if (performers.length === 0) {
    container.innerHTML = '<p class="no-data">No performance data available</p>';
    return;
  }

  let html = '<div class="performers-list">';
  performers.forEach((performer, index) => {
    const worker = performer.worker[0];
    if (worker) {
      html += `
        <div class="performer-item">
          <span class="rank">#${index + 1}</span>
          <span class="name">${worker.firstName} ${worker.lastName}</span>
          <span class="stats">${performer.uniquePackages} packages (${performer.totalActions} actions)</span>
        </div>
      `;
    }
  });
  html += '</div>';
  
  container.innerHTML = html;
}

function displayCarrierPerformance(carriers) {
  const container = document.getElementById('carrier-performance-chart');
  
  if (carriers.length === 0) {
    container.innerHTML = '<p class="no-data">No carrier data available</p>';
    return;
  }

  let html = '<div class="carrier-stats">';
  carriers.forEach(carrier => {
    const deliveryRate = (carrier.deliveryRate * 100).toFixed(1);
    const issueRate = (carrier.issueRate * 100).toFixed(1);
    
    html += `
      <div class="carrier-item">
        <div class="carrier-name">${carrier._id}</div>
        <div class="carrier-metrics">
          <div class="metric">
            <span class="label">Packages:</span>
            <span class="value">${carrier.totalPackages}</span>
          </div>
          <div class="metric">
            <span class="label">Delivery Rate:</span>
            <span class="value">${deliveryRate}%</span>
          </div>
          <div class="metric">
            <span class="label">Issue Rate:</span>
            <span class="value">${issueRate}%</span>
          </div>
        </div>
      </div>
    `;
  });
  html += '</div>';
  
  container.innerHTML = html;
}

function displayRecentActivity(activities) {
  const container = document.getElementById('admin-recent-activity');
  
  if (activities.length === 0) {
    container.innerHTML = '<p class="no-data">No recent activity</p>';
    return;
  }

  let html = '<div class="activity-list">';
  activities.slice(0, 10).forEach(activity => {
    const worker = activity.updatedBy;
    const mail = activity.mailId;
    const timeAgo = new Date(activity.timestamp).toLocaleString();
    
    html += `
      <div class="activity-item">
        <div class="activity-icon">${getStatusIcon(activity.newStatus)}</div>
        <div class="activity-details">
          <div class="activity-text">
            <strong>${worker?.firstName} ${worker?.lastName}</strong> 
            updated <strong>${mail?.trackingNumber}</strong> to 
            <span class="status">${activity.newStatus}</span>
          </div>
          <div class="activity-time">${timeAgo}</div>
        </div>
      </div>
    `;
  });
  html += '</div>';
  
  container.innerHTML = html;
}

async function loadAllPackages() {
  try {
    showLoading(true);

    // Get filter values
    const status = document.getElementById('admin-filter-status')?.value || '';
    const carrier = document.getElementById('admin-filter-carrier')?.value || '';
    const worker = document.getElementById('admin-filter-worker')?.value || '';
    const dateFrom = document.getElementById('admin-filter-date-from')?.value || '';
    const dateTo = document.getElementById('admin-filter-date-to')?.value || '';

    // Build query parameters
    const params = new URLSearchParams({
      page: 1,
      limit: 50,
      ...(status && { status }),
      ...(carrier && { carrier }),
      ...(worker && { worker }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo })
    });

    const response = await fetch(`/api/admin/packages?${params}`, {
      headers: {
        'Authorization': `Bearer ${apiClient.token}`
      }
    });

    const result = await response.json();

    if (result.success) {
      displayPackagesTable(result.data.packages);
      displayPackagePagination(result.data.pagination);
    } else {
      throw new Error(result.message);
    }

  } catch (error) {
    console.error('Load packages error:', error);
    document.getElementById('admin-packages-table').innerHTML = 
      '<div class="error-message">Failed to load packages</div>';
  } finally {
    showLoading(false);
  }
}

function displayPackagesTable(packages) {
  const container = document.getElementById('admin-packages-table');
  
  if (packages.length === 0) {
    container.innerHTML = '<p class="no-data">No packages found</p>';
    return;
  }

  let html = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Tracking Number</th>
          <th>Carrier</th>
          <th>Status</th>
          <th>Recipient</th>
          <th>Scanned By</th>
          <th>Scan Date</th>
          <th>Last Updated</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;

  packages.forEach(pkg => {
    const scannedBy = pkg.scannedBy;
    const lastUpdatedBy = pkg.lastUpdatedBy;
    
    html += `
      <tr>
        <td>
          <code class="tracking-code">${pkg.trackingNumber}</code>
          ${pkg.isConfidential ? '🔒' : ''}
        </td>
        <td>
          <span class="carrier-badge carrier-${pkg.carrier.toLowerCase()}">${pkg.carrier}</span>
        </td>
        <td>
          <span class="status-badge status-${pkg.status.toLowerCase().replace('_', '-')}">${pkg.status}</span>
        </td>
        <td>${pkg.recipientName || 'Unknown'}</td>
        <td>
          ${scannedBy ? `${scannedBy.firstName} ${scannedBy.lastName}` : 'Unknown'}
        </td>
        <td>${new Date(pkg.scanInDate).toLocaleDateString()}</td>
        <td>
          ${pkg.lastStatusUpdate ? new Date(pkg.lastStatusUpdate).toLocaleDateString() : 'N/A'}
          ${lastUpdatedBy ? `<br><small>by ${lastUpdatedBy.firstName} ${lastUpdatedBy.lastName}</small>` : ''}
        </td>
        <td>
          <div class="action-buttons">
            <button onclick="viewPackageDetails('${pkg._id}')" class="btn-sm btn-primary">View</button>
            <button onclick="trackPackage('${pkg.trackingNumber}')" class="btn-sm btn-secondary">Track</button>
          </div>
        </td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

async function loadWorkerPerformance() {
  try {
    showLoading(true);

    // Load all deliverer users for selection
    const usersResponse = await fetch('/api/users?userType=deliverer', {
      headers: {
        'Authorization': `Bearer ${apiClient.token}`
      }
    });

    if (usersResponse.ok) {
      const usersResult = await usersResponse.json();
      displayWorkerCards(usersResult.data || []);
    }

  } catch (error) {
    console.error('Load worker performance error:', error);
    showNotification('Failed to load worker performance data', 'error');
  } finally {
    showLoading(false);
  }
}

function displayWorkerCards(workers) {
  const container = document.getElementById('worker-summary-cards');
  
  if (workers.length === 0) {
    container.innerHTML = '<p class="no-data">No worker data available</p>';
    return;
  }

  let html = '';
  workers.forEach(worker => {
    html += `
      <div class="worker-card" onclick="loadWorkerDetails('${worker._id}')">
        <div class="worker-header">
          <h4>${worker.firstName} ${worker.lastName}</h4>
          <span class="worker-level">Level ${worker.delivererInfo?.level || 1}</span>
        </div>
        <div class="worker-info">
          <p><strong>Employee ID:</strong> ${worker.delivererInfo?.employeeId || 'N/A'}</p>
          <p><strong>Email:</strong> ${worker.email}</p>
          <p><strong>Last Login:</strong> ${worker.lastLogin ? new Date(worker.lastLogin).toLocaleDateString() : 'Never'}</p>
          <p><strong>Status:</strong> ${worker.isActive ? '✅ Active' : '❌ Inactive'}</p>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

async function loadWorkerDetails(workerId) {
  try {
    showLoading(true);

    const response = await fetch(`/api/admin/workers/${workerId}/performance?timeframe=30d`, {
      headers: {
        'Authorization': `Bearer ${apiClient.token}`
      }
    });

    const result = await response.json();

    if (result.success) {
      displayWorkerDetails(result.data);
    } else {
      throw new Error(result.message);
    }

  } catch (error) {
    console.error('Load worker details error:', error);
    showNotification('Failed to load worker details', 'error');
  } finally {
    showLoading(false);
  }
}

function displayWorkerDetails(data) {
  const container = document.getElementById('worker-performance-details');
  const worker = data.worker;
  const performance = data.performance;

  let html = `
    <div class="worker-detail-card">
      <div class="worker-detail-header">
        <h4>${worker.name}</h4>
        <span class="worker-badge level-${worker.level}">Level ${worker.level}</span>
      </div>
      
      <div class="performance-metrics">
        <div class="metric-grid">
          <div class="metric">
            <h5>Packages Handled</h5>
            <div class="metric-value">${performance.packagesHandled?.[0]?.totalPackages || 0}</div>
          </div>
          
          <div class="metric">
            <h5>Scanned Packages</h5>
            <div class="metric-value">${performance.packagesHandled?.[0]?.scanned || 0}</div>
          </div>
          
          <div class="metric">
            <h5>Delivered Packages</h5>
            <div class="metric-value">${performance.packagesHandled?.[0]?.delivered || 0}</div>
          </div>
          
          <div class="metric">
            <h5>Issues Resolved</h5>
            <div class="metric-value">${performance.issueResolution?.[0]?.totalResolved || 0}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

async function loadIssues() {
  try {
    showLoading(true);

    const status = document.getElementById('issue-status-filter')?.value || 'all';
    const priority = document.getElementById('issue-priority-filter')?.value || '';
    const assignee = document.getElementById('issue-assignee-filter')?.value || '';

    const params = new URLSearchParams({
      ...(status !== 'all' && { status }),
      ...(priority && { priority }),
      ...(assignee && { assignedTo: assignee })
    });

    const response = await fetch(`/api/admin/issues?${params}`, {
      headers: {
        'Authorization': `Bearer ${apiClient.token}`
      }
    });

    const result = await response.json();

    if (result.success) {
      displayIssues(result.data.issues);
      updateIssueStats(result.data.statistics);
    } else {
      throw new Error(result.message);
    }

  } catch (error) {
    console.error('Load issues error:', error);
    showNotification('Failed to load issues', 'error');
  } finally {
    showLoading(false);
  }
}

function displayIssues(issues) {
  const container = document.getElementById('admin-issues-list');
  
  if (issues.length === 0) {
    container.innerHTML = '<p class="no-data">No issues found</p>';
    return;
  }

  let html = '';
  issues.forEach(issue => {
    const reporter = issue.reportedBy;
    const assignee = issue.assignedTo;
    
    html += `
      <div class="issue-card">
        <div class="issue-header">
          <h4>${issue.title}</h4>
          <div class="issue-badges">
            <span class="priority-badge priority-${issue.priority.toLowerCase()}">${issue.priority}</span>
            <span class="status-badge status-${issue.status.toLowerCase().replace('_', '-')}">${issue.status}</span>
          </div>
        </div>
        
        <div class="issue-details">
          <p><strong>Category:</strong> ${issue.category}</p>
          <p><strong>Reported by:</strong> ${reporter?.firstName} ${reporter?.lastName} (${reporter?.email})</p>
          ${assignee ? `<p><strong>Assigned to:</strong> ${assignee.firstName} ${assignee.lastName}</p>` : ''}
          <p><strong>Created:</strong> ${new Date(issue.createdAt).toLocaleDateString()}</p>
          ${issue.mailId ? `<p><strong>Package:</strong> ${issue.mailId.trackingNumber}</p>` : ''}
        </div>
        
        <div class="issue-description">
          <p>${issue.description}</p>
        </div>
        
        <div class="issue-actions">
          <button onclick="viewIssueDetails('${issue._id}')" class="btn-sm btn-primary">View Details</button>
          ${issue.status === 'OPEN' ? `<button onclick="assignIssue('${issue._id}')" class="btn-sm btn-secondary">Assign</button>` : ''}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

async function loadAuditTrail() {
  try {
    showLoading(true);

    const workerId = document.getElementById('audit-worker-filter')?.value || '';
    const action = document.getElementById('audit-action-filter')?.value || '';
    const dateFrom = document.getElementById('audit-date-from')?.value || '';
    const dateTo = document.getElementById('audit-date-to')?.value || '';

    const params = new URLSearchParams({
      page: 1,
      limit: 100,
      ...(workerId && { workerId }),
      ...(action && { action }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo })
    });

    const response = await fetch(`/api/admin/audit/worker-activity?${params}`, {
      headers: {
        'Authorization': `Bearer ${apiClient.token}`
      }
    });

    const result = await response.json();

    if (result.success) {
      displayAuditTrail(result.data.activities);
    } else {
      throw new Error(result.message);
    }

  } catch (error) {
    console.error('Load audit trail error:', error);
    showNotification('Failed to load audit trail', 'error');
  } finally {
    showLoading(false);
  }
}

function displayAuditTrail(activities) {
  const container = document.getElementById('audit-trail-results');
  
  if (activities.length === 0) {
    container.innerHTML = '<p class="no-data">No audit records found</p>';
    return;
  }

  let html = '<div class="audit-timeline">';
  activities.forEach(activity => {
    const worker = activity.updatedBy;
    const mail = activity.mailId;
    
    html += `
      <div class="audit-entry">
        <div class="audit-timestamp">
          ${new Date(activity.timestamp).toLocaleString()}
        </div>
        
        <div class="audit-content">
          <div class="audit-action">
            <strong>${worker?.firstName} ${worker?.lastName}</strong>
            <span class="action-type">${activity.newStatus}</span>
          </div>
          
          <div class="audit-details">
            Package: <code>${mail?.trackingNumber}</code>
            ${activity.previousStatus ? `(${activity.previousStatus} → ${activity.newStatus})` : ''}
          </div>
          
          ${activity.notes ? `<div class="audit-notes">Notes: ${activity.notes}</div>` : ''}
          
          <div class="audit-metadata">
            ${activity.metadata?.ipAddress ? `IP: ${activity.metadata.ipAddress}` : ''}
            ${activity.metadata?.userAgent ? `• Device: ${activity.metadata.userAgent.substring(0, 50)}...` : ''}
          </div>
        </div>
      </div>
    `;
  });
  html += '</div>';

  container.innerHTML = html;
}

// Helper functions for admin panel
function getStatusIcon(status) {
  const icons = {
    'SCANNED_IN': '📥',
    'PROCESSING': '⚙️',
    'READY_PICKUP': '📦',
    'DELIVERED': '✅',
    'EXCEPTION': '⚠️',
    'LOST': '❌',
    'DAMAGED': '💔'
  };
  return icons[status] || '📋';
}

function clearPackageFilters() {
  document.getElementById('admin-filter-status').value = '';
  document.getElementById('admin-filter-carrier').value = '';
  document.getElementById('admin-filter-worker').value = '';
  document.getElementById('admin-filter-date-from').value = '';
  document.getElementById('admin-filter-date-to').value = '';
  loadAllPackages();
}

function loadFilteredPackages() {
  loadAllPackages();
}

// Placeholder functions for actions
function viewPackageDetails(packageId) {
  showNotification(`Viewing package details: ${packageId}`, 'info');
}

function viewIssueDetails(issueId) {
  showNotification(`Viewing issue details: ${issueId}`, 'info');
}

function assignIssue(issueId) {
  const assignee = prompt('Enter worker ID to assign this issue to:');
  if (assignee) {
    showNotification(`Issue ${issueId} assigned to ${assignee}`, 'success');
  }
}

// Auto-refresh stats every 30 seconds
setInterval(async () => {
  if (document.querySelector('#overview-section.active')) {
    await loadDashboardStats();
  }
}, 30000);