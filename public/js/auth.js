// Supabase client and auth helpers
let supabaseClient = null;
let currentUser = null;
let isUsingPlaceholderCreds = false;

// Initialize Supabase from public-config endpoint
async function initAuth() {
  try {
    const res = await fetch('/api/public-config');
    if (!res.ok) throw new Error('Failed to fetch config');
    const { supabaseUrl, supabaseAnonKey } = await res.json();

    // Check if credentials are placeholders
    if (supabaseUrl.includes('your-project') || supabaseAnonKey.includes('your_anon_key')) {
      console.warn('Supabase credentials not configured - showing auth screen anyway');
      isUsingPlaceholderCreds = true;
      window.isUsingPlaceholderCreds = true; // Make available globally
      return null;
    }

    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

    // Check for existing session
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      currentUser = session.user;
      return session;
    }
    return null;
  } catch (error) {
    console.error('Auth init error:', error);
    // Return null instead of throwing so auth screen still shows
    return null;
  }
}

// Sign in with Google
async function signInWithGoogle() {
  try {
    if (!supabaseClient) {
      showToast('Authentication not configured. Please check .env file.', 'error');
      return;
    }

    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });

    if (error) throw error;
    // OAuth redirect happens automatically
  } catch (error) {
    console.error('Google sign-in error:', error);
    showToast('Sign-in failed. Please try again.', 'error');
  }
}

// Sign out
async function signOut() {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    window.location.reload();
  } catch (error) {
    console.error('Sign-out error:', error);
    showToast('Sign-out failed. Please try again.', 'error');
  }
}

// Fetch with auth header
async function signedFetch(url, options = {}) {
  if (!currentUser) {
    // Try to get fresh session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.reload();
      return;
    }
    currentUser = session.user;
  }

  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${await getAccessToken()}`
  };

  return fetch(url, { ...options, headers });
}

// Get fresh access token
async function getAccessToken() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.reload();
    return null;
  }
  return session.access_token;
}

// Handle OAuth redirect
async function handleOAuthRedirect() {
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');

  if (accessToken && refreshToken) {
    console.log('Auth: Detected OAuth redirect, setting session...');

    // Initialize Supabase client if not already done
    if (!supabaseClient) {
      const res = await fetch('/api/public-config');
      if (!res.ok) return false;
      const { supabaseUrl, supabaseAnonKey } = await res.json();
      supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    }

    await supabaseClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    // Clear the hash and reload
    window.location.hash = '';
    window.location.reload();
    return true;
  }
  return false;
}

// Make functions available globally for app.js
window.handleOAuthRedirect = handleOAuthRedirect;
window.initAuth = initAuth;
window.signInWithGoogle = signInWithGoogle;
window.signOut = signOut;
window.signedFetch = signedFetch;
