// Twilio Voice SDK wrapper (lazy initialization)
let twilioDevice = null;
let activeConnection = null;
let isSdkLoaded = false;

// Check if Twilio SDK is loaded
function checkTwilioSdk() {
  if (typeof Twilio !== 'undefined' && Twilio.Device) {
    isSdkLoaded = true;
    return true;
  }
  return false;
}

// Wait for Twilio SDK to load
function waitForTwilioSdk(callback, timeout = 5000) {
  if (checkTwilioSdk()) {
    callback();
    return;
  }

  const startTime = Date.now();
  const interval = setInterval(() => {
    if (checkTwilioSdk()) {
      clearInterval(interval);
      callback();
    } else if (Date.now() - startTime > timeout) {
      clearInterval(interval);
      console.warn('Twilio Voice SDK not available - browser calling disabled');
      callback(new Error('Twilio Voice SDK not available. Please use "Forward to my cell" option.'));
    }
  }, 100);
}

// Initialize Twilio Device with access token
async function initVoiceDevice(token) {
  if (twilioDevice) {
    return twilioDevice;
  }

  return new Promise((resolve, reject) => {
    waitForTwilioSdk((error) => {
      if (error) {
        reject(error);
        return;
      }

      try {
        twilioDevice = new Twilio.Device(token, {
          codecPreferences: ['opus', 'pcmu'],
          fakeLocalDTMF: true,
          enableRinging: true
        });

        // Set up event listeners
        twilioDevice.on('ready', () => {
          console.log('Twilio Device ready');
          resolve(twilioDevice);
        });

        twilioDevice.on('error', (error) => {
          console.error('Twilio Device error:', error);
          showToast(`Call error: ${error.message}`, 'error');
        });

        twilioDevice.on('incoming', (connection) => {
          console.log('Incoming call:', connection);
          // Auto-reject for now - inbound is handled via forwarding
          connection.reject();
        });

        // Resolve immediately if device is already ready
        if (twilioDevice.readyState === 'ready') {
          resolve(twilioDevice);
        }
      } catch (error) {
        console.error('Failed to initialize Twilio Device:', error);
        reject(error);
      }
    });
  });
}

// Make a browser call
async function makeBrowserCall(from, to) {
  try {
    if (!twilioDevice) {
      // Get a fresh token
      const res = await signedFetch('/api/voice/token');
      if (!res.ok) throw new Error('Failed to get voice token');
      const { token } = await res.json();
      await initVoiceDevice(token);
    }

    const params = { To: to, From: from };
    activeConnection = twilioDevice.connect(params);

    activeConnection.on('ringing', () => {
      updateCallStatus('Ringing...');
    });

    activeConnection.on('accept', () => {
      updateCallStatus('Connected');
    });

    activeConnection.on('disconnect', (conn) => {
      updateCallStatus('Call ended');
      activeConnection = null;
    });

    updateCallStatus('Connecting...');
    return true;
  } catch (error) {
    console.error('Browser call error:', error);
    if (error.message.includes('SDK')) {
      showToast('Browser calling not available. Please use "Forward to my cell" option.', 'error');
    } else {
      showToast('Failed to place call', 'error');
    }
    return false;
  }
}

// Hang up active call
function hangUpCall() {
  if (activeConnection) {
    activeConnection.disconnect();
    activeConnection = null;
  } else if (twilioDevice) {
    twilioDevice.destroy();
    twilioDevice = null;
  }
}

// Update call status UI
function updateCallStatus(status) {
  const statusEl = document.querySelector('.call-status');
  if (statusEl) {
    statusEl.textContent = status;
  }
}

// Make functions available globally for app.js
window.initVoiceDevice = initVoiceDevice;
window.makeBrowserCall = makeBrowserCall;
window.hangUpCall = hangUpCall;
window.updateCallStatus = updateCallStatus;
