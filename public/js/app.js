// Main app controller
let selectedNumber = null;
let numbers = [];
let settings = null;
let smsSubscription = null;
let currentTheme = 'dark';

// Theme management
function applyTheme(theme) {
  currentTheme = theme;
  if (theme === 'light') {
    document.body.classList.add('light-mode');
  } else {
    document.body.classList.remove('light-mode');
  }
  localStorage.setItem('theme', theme);
}

function loadSavedTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  applyTheme(savedTheme);
  return savedTheme;
}

// Initialize app
async function initApp() {
  try {
    console.log('App: Starting initialization...');

    // Load saved theme first
    loadSavedTheme();

    // Check for OAuth redirect
    const handledRedirect = await handleOAuthRedirect();
    if (handledRedirect) {
      // Will reload after redirect is processed
      console.log('App: OAuth redirect handled, will reload');
      return;
    }

    console.log('App: Initializing auth...');
    // Initialize auth
    const session = await initAuth();
    console.log('App: Auth initialized, session:', session ? 'found' : 'none');

    if (session) {
      console.log('App: Showing main app...');
      showMainApp();
      await loadInitialData();
    } else {
      console.log('App: Showing auth screen...');
      showAuthScreen();
    }
  } catch (error) {
    console.error('App init error:', error);
    showToast('Failed to initialize app. Please refresh.', 'error');
  }
}

// Show/hide screens
function showAuthScreen() {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');

  // Show dev warning if using placeholder credentials
  if (window.isUsingPlaceholderCreds) {
    document.getElementById('dev-warning').classList.remove('hidden');
  }
}

function showMainApp() {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
}

// Load initial data
async function loadInitialData() {
  try {
    // Load balance and numbers in parallel
    const [balanceRes, numbersRes, settingsRes] = await Promise.all([
      signedFetch('/api/balance'),
      signedFetch('/api/numbers'),
      signedFetch('/api/settings')
    ]);

    if (balanceRes.ok) {
      const balance = await balanceRes.json();
      if (balance && balance.balance !== null && balance.balance !== undefined) {
        document.getElementById('balance-amount').textContent =
          `${balance.balance.toFixed(2)} ${balance.currency}`;
      } else {
        document.getElementById('balance-amount').textContent = 'N/A';
      }
    } else {
      console.error('Balance API error:', balanceRes.status);
      document.getElementById('balance-amount').textContent = 'Error';
    }

    if (numbersRes.ok) {
      numbers = await numbersRes.json();
      renderNumbersList();
    }

    if (settingsRes.ok) {
      settings = await settingsRes.json();
      populateSettingsForm();
    }
  } catch (error) {
    console.error('Failed to load initial data:', error);
  }
}

// Render numbers list
function renderNumbersList() {
  const list = document.getElementById('numbers-list');
  list.innerHTML = '';

  numbers.forEach(num => {
    const li = document.createElement('li');
    li.className = 'number-item';
    if (selectedNumber && selectedNumber.sid === num.sid) {
      li.classList.add('selected');
    }

    const badges = Object.entries(num.capabilities || {})
      .filter(([_, enabled]) => enabled)
      .map(([cap]) => `<span class="badge">${cap}</span>`)
      .join('');

    li.innerHTML = `
      <span class="phone-number">${num.phoneNumber}</span>
      <span class="friendly-name">${num.friendlyName || 'Unnamed'}</span>
      <div class="capability-badges">${badges}</div>
    `;

    li.addEventListener('click', () => selectNumber(num));
    list.appendChild(li);
  });
}

// Select a number
async function selectNumber(number) {
  selectedNumber = number;
  renderNumbersList();

  // Update UI
  document.getElementById('no-number-selected').classList.add('hidden');
  document.getElementById('number-detail').classList.remove('hidden');
  document.getElementById('selected-number-display').textContent = number.phoneNumber;

  // Render capabilities
  const capsDiv = document.getElementById('selected-number-capabilities');
  capsDiv.innerHTML = Object.entries(number.capabilities || {})
    .filter(([_, enabled]) => enabled)
    .map(([cap]) => `<span class="badge">${cap}</span>`)
    .join('');

  // Close mobile sidebar
  if (window.innerWidth <= 760) {
    document.getElementById('sidebar').classList.remove('open');
  }

  // Load messages for this number
  await loadMessages();
}

// Load messages for selected number
async function loadMessages() {
  if (!selectedNumber) return;

  try {
    const res = await signedFetch(`/api/messages?number=${selectedNumber.phoneNumber}&limit=50`);
    if (res.ok) {
      const messages = await res.json();
      renderMessages(messages);

      // Set up realtime subscription
      setupSMSRealtime();
    }
  } catch (error) {
    console.error('Failed to load messages:', error);
  }
}

// Render messages
function renderMessages(messages) {
  const thread = document.getElementById('sms-thread');
  thread.innerHTML = '';

  if (messages.length === 0) {
    thread.innerHTML = '<p style="color: var(--text-muted); text-align: center;">No messages yet</p>';
    return;
  }

  messages.forEach(msg => {
    const div = document.createElement('div');
    div.className = `message ${msg.direction}`;

    const sender = msg.direction === 'inbound' ? msg.from_number : msg.to_number;

    div.innerHTML = `
      <div class="sender">${sender}</div>
      <div class="body">${escapeHtml(msg.body)}</div>
      <div class="timestamp">${formatTimestamp(msg.created_at)}</div>
    `;

    thread.appendChild(div);
  });
}

// Setup SMS realtime
function setupSMSRealtime() {
  if (smsSubscription) {
    smsSubscription.unsubscribe();
  }

  if (!supabaseClient || !selectedNumber) return;

  smsSubscription = supabaseClient
    .channel('sms-changes')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `twilio_number=eq.${selectedNumber.phoneNumber}`
    }, (payload) => {
      // New message received, reload thread
      loadMessages();
    })
    .subscribe();
}

// Send SMS
async function sendSMS(to, body) {
  try {
    const res = await signedFetch('/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: selectedNumber.phoneNumber,
        to: formatPhoneNumber(to),
        body
      })
    });

    if (res.ok) {
      showToast('Message sent', 'success');
      document.getElementById('sms-form').reset();
      await loadMessages();
    } else {
      const error = await res.json();
      showToast(`Failed to send: ${error.error || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    console.error('Send SMS error:', error);
    showToast('Failed to send message', 'error');
  }
}

// Make call
async function makeCall(to, mode) {
  if (mode === 'browser') {
    const success = await makeBrowserCall(selectedNumber.phoneNumber, formatPhoneNumber(to));
    if (success) {
      document.getElementById('call-form').classList.add('hidden');
      document.getElementById('active-call').classList.remove('hidden');
    }
  } else {
    // Forward mode
    try {
      const res = await signedFetch('/api/calls/dial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: selectedNumber.phoneNumber,
          to: formatPhoneNumber(to)
        })
      });

      if (res.ok) {
        showToast('Initiating call to your cell first...', 'success');
      } else {
        showToast('Failed to initiate call', 'error');
      }
    } catch (error) {
      console.error('Dial error:', error);
      showToast('Failed to place call', 'error');
    }
  }
}

// Refresh balance
async function refreshBalance() {
  try {
    const res = await signedFetch('/api/balance');
    if (res.ok) {
      const balance = await res.json();
      document.getElementById('balance-amount').textContent =
        `${balance.balance.toFixed(2)} ${balance.currency}`;
      showToast('Balance updated', 'success');
    }
  } catch (error) {
    console.error('Balance refresh error:', error);
    showToast('Failed to refresh balance', 'error');
  }
}

// Settings
function populateSettingsForm() {
  if (!settings) return;

  // Set current theme
  document.getElementById('settings-theme').value = currentTheme;

  document.getElementById('settings-forward-to').value = settings.forward_to || '';
  document.getElementById('settings-call-mode').value = settings.preferred_call_mode || 'browser';

  // Populate caller ID select
  const select = document.getElementById('settings-default-caller-id');
  select.innerHTML = '';
  numbers.forEach(num => {
    const option = document.createElement('option');
    option.value = num.phoneNumber;
    option.textContent = num.phoneNumber;
    if (num.phoneNumber === settings.default_caller_id) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

async function saveSettings(newSettings) {
  try {
    const res = await signedFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings)
    });

    if (res.ok) {
      settings = await res.json();
      showToast('Settings saved', 'success');
      closeModal('settings-modal');
    } else {
      showToast('Failed to save settings', 'error');
    }
  } catch (error) {
    console.error('Save settings error:', error);
    showToast('Failed to save settings', 'error');
  }
}

// Buy number search
async function searchAvailableNumbers(params) {
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await signedFetch(`/api/available-numbers?${qs}`);

    if (res.ok) {
      const results = await res.json();
      renderBuyResults(results);
    } else {
      showToast('Failed to search numbers', 'error');
    }
  } catch (error) {
    console.error('Search numbers error:', error);
    showToast('Failed to search numbers', 'error');
  }
}

function renderBuyResults(results) {
  const container = document.getElementById('buy-results');
  container.innerHTML = '';

  if (!results || results.length === 0) {
    container.innerHTML = '<p style="color: var(--text-secondary);">No numbers found</p>';
    return;
  }

  results.forEach(num => {
    const div = document.createElement('div');
    div.className = 'buy-result';
    div.innerHTML = `
      <span>${num.phone_number}</span>
      <button class="btn btn-primary btn-sm" data-number="${num.phone_number}">Buy</button>
    `;
    container.appendChild(div);
  });

  // Add click handlers
  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => purchaseNumber(btn.dataset.number));
  });
}

async function purchaseNumber(phoneNumber) {
  try {
    const res = await signedFetch('/api/numbers/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber })
    });

    if (res.ok) {
      showToast('Number purchased! Webhooks wired automatically.', 'success');
      closeModal('buy-modal');
      await loadInitialData(); // Refresh numbers list
    } else {
      const error = await res.json();
      showToast(`Purchase failed: ${error.error || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    console.error('Purchase error:', error);
    showToast('Failed to purchase number', 'error');
  }
}

// Modal helpers
function openModal(id) {
  console.log('Opening modal:', id);
  const modal = document.getElementById(id);
  const overlay = document.getElementById('modal-overlay');
  if (modal && overlay) {
    modal.classList.remove('hidden');
    overlay.classList.remove('hidden');
  } else {
    console.error('Modal or overlay not found:', { modal: !!modal, overlay: !!overlay });
  }
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.getElementById('modal-overlay').classList.add('hidden');
}

// Make modal functions globally available
window.openModal = openModal;
window.closeModal = closeModal;

// Toast notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 4000);
}

// Helpers
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTimestamp(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString();
}

function formatPhoneNumber(input) {
  // Strip everything except digits and +
  let cleaned = input.replace(/[^\d+]/g, '');
  // Add + if missing and not starting with 0
  if (!cleaned.startsWith('+') && !cleaned.startsWith('0')) {
    cleaned = '+1' + cleaned;
  }
  return cleaned;
}

// Event listeners setup
function setupEventListeners() {
  // Auth
  document.getElementById('google-signin').addEventListener('click', signInWithGoogle);
  document.getElementById('signout-btn').addEventListener('click', signOut);

  // Balance
  document.getElementById('refresh-balance').addEventListener('click', refreshBalance);

  // Sidebar
  const menuToggle = document.getElementById('menu-toggle');
  menuToggle.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Modals
  document.getElementById('buy-number-btn').addEventListener('click', () => openModal('buy-modal'));
  document.getElementById('settings-btn').addEventListener('click', () => openModal('settings-modal'));
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') {
      document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
      document.getElementById('modal-overlay').classList.add('hidden');
    }
  });
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal').classList.add('hidden');
      document.getElementById('modal-overlay').classList.add('hidden');
    });
  });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  // SMS form
  document.getElementById('sms-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const to = document.getElementById('sms-to').value;
    const body = document.getElementById('sms-body').value;
    sendSMS(to, body);
  });

  // Call form
  document.getElementById('call-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const to = document.getElementById('call-to').value;
    const mode = document.querySelector('input[name="call-mode"]:checked').value;
    makeCall(to, mode);
  });

  // Hang up
  document.getElementById('hangup-btn').addEventListener('click', () => {
    hangUpCall();
    document.getElementById('call-form').classList.remove('hidden');
    document.getElementById('active-call').classList.add('hidden');
  });

  // Buy form
  document.getElementById('buy-form').addEventListener('submit', (e) => {
    e.preventDefault();
    searchAvailableNumbers({
      country: document.getElementById('buy-country').value,
      type: document.getElementById('buy-type').value,
      areaCode: document.getElementById('buy-area-code').value || undefined,
      contains: document.getElementById('buy-contains').value || undefined
    });
  });

  // Settings form
  document.getElementById('settings-form').addEventListener('submit', (e) => {
    e.preventDefault();

    // Handle theme separately (local storage only)
    const theme = document.getElementById('settings-theme').value;
    applyTheme(theme);

    // Save server-side settings
    saveSettings({
      forward_to: document.getElementById('settings-forward-to').value,
      preferred_call_mode: document.getElementById('settings-call-mode').value,
      default_caller_id: document.getElementById('settings-default-caller-id').value
    });
  });
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initApp();

  // Safety timeout: always hide loading screen after 5 seconds
  setTimeout(() => {
    const loading = document.getElementById('loading');
    if (loading && !loading.classList.contains('hidden')) {
      console.error('App: Loading timeout - forcing auth screen');
      loading.classList.add('hidden');
      document.getElementById('auth-screen').classList.remove('hidden');
    }
  }, 5000);

  // Keyboard shortcut for settings (Ctrl/Cmd + ,)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      const settingsBtn = document.getElementById('settings-btn');
      if (settingsBtn) {
        settingsBtn.click();
      } else {
        // Fallback: open settings modal directly
        openModal('settings-modal');
      }
    }
  });

  // TEST: Centered Settings button click handler
  const testSettingsBtn = document.getElementById('test-settings-btn');
  if (testSettingsBtn) {
    testSettingsBtn.addEventListener('click', () => {
      console.log('TEST: Opening settings modal from center button');

      // Check if modal exists
      const modal = document.getElementById('settings-modal');
      const overlay = document.getElementById('modal-overlay');
      console.log('Elements found:', { modal: !!modal, overlay: !!overlay });

      if (modal && overlay) {
        modal.classList.remove('hidden');
        overlay.classList.remove('hidden');
        console.log('Modal classes:', modal.className);
        console.log('Modal display:', window.getComputedStyle(modal).display);
      } else {
        console.error('Modal or overlay not found!');
      }
    });
  }
});
