const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

// Twilio
const twilio = require('twilio');
// Supabase (server-side)
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Environment variables (Vercel makes these available)
const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_API_KEY_SID,
  TWILIO_API_KEY_SECRET,
  TWILIO_TWIML_APP_SID,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  PUBLIC_BASE_URL,
  ALLOWED_EMAILS
} = process.env;

// Initialize Twilio clients (only if credentials are valid)
const isValidTwilioCreds = TWILIO_ACCOUNT_SID && TWILIO_ACCOUNT_SID.startsWith('AC') && TWILIO_AUTH_TOKEN;
const twilioClient = isValidTwilioCreds ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;
const twilioVoiceClient = isValidTwilioCreds && TWILIO_API_KEY_SID && TWILIO_API_KEY_SECRET
  ? new twilio(TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, { accountSid: TWILIO_ACCOUNT_SID })
  : null;

// Initialize Supabase client (service role, only if credentials are valid)
const isValidSupabaseCreds = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY;
const supabase = isValidSupabaseCreds ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;

// Parse allowed emails
const allowedEmails = (ALLOWED_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

// Middleware
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Auth middleware: validate Supabase JWT and check allowed emails
async function requireAuth(req, res, next) {
  try {
    // Check if Supabase is configured
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.substring(7);

    // Verify JWT with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check email allow-list
    if (!allowedEmails.includes(user.email.toLowerCase())) {
      return res.status(403).json({ error: 'Email not authorized' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// Middleware to check if Supabase is configured
function requireSupabase(req, res, next) {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }
  next();
}

// Webhook signature validation for Twilio
function validateTwilioSignature(req, res, next) {
  const url = `${PUBLIC_BASE_URL}${req.path}`;
  const signature = req.headers['x-twilio-signature'];
  const params = req.body;

  if (!signature) {
    return res.status(403).send('Missing signature');
  }

  // Compute expected signature
  const sortedParams = Object.keys(params).sort().reduce((acc, key) => {
    acc[key] = params[key];
    return acc;
  }, {});

  const queryString = new URLSearchParams(sortedParams).toString();
  const data = url + queryString;
  const expectedSignature = crypto
    .createHmac('sha1', TWILIO_AUTH_TOKEN)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');

  if (signature !== expectedSignature) {
    console.error('Signature mismatch:', { expected: expectedSignature, received: signature });
    return res.status(403).send('Invalid signature');
  }

  next();
}

// ==================== API Routes ====================

// GET /api/public-config - No auth required
app.get('/api/public-config', (req, res) => {
  res.json({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY
  });
});

// GET /api/me - Confirm user is allowed
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ email: req.user.email, authorized: true });
});

// GET /api/balance - Get account balance
app.get('/api/balance', requireAuth, requireSupabase, async (req, res) => {
  try {
    const account = await twilioClient.api.v2010.accounts(TWILIO_ACCOUNT_SID).fetch();
    res.json({
      balance: parseFloat(account.balance),
      currency: account.currency
    });
  } catch (error) {
    console.error('Balance error:', error);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// GET /api/numbers - List all owned numbers
app.get('/api/numbers', requireAuth, async (req, res) => {
  try {
    const incomingNumbers = await twilioClient.incomingPhoneNumbers.list();
    const numbers = incomingNumbers.map(n => ({
      sid: n.sid,
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName,
      capabilities: n.capabilities
    }));
    res.json(numbers);
  } catch (error) {
    console.error('Numbers list error:', error);
    res.status(500).json({ error: 'Failed to fetch numbers' });
  }
});

// POST /api/numbers/:sid/wire-webhooks - Point number's webhooks at portal
app.post('/api/numbers/:sid/wire-webhooks', requireAuth, requireSupabase, async (req, res) => {
  try {
    const { sid } = req.params;
    const smsUrl = `${PUBLIC_BASE_URL}/webhooks/sms`;
    const voiceUrl = `${PUBLIC_BASE_URL}/webhooks/voice`;

    await twilioClient.incomingPhoneNumbers(sid).update({
      smsUrl: smsUrl,
      smsStatusCallback: `${PUBLIC_BASE_URL}/webhooks/sms-status`,
      voiceUrl: voiceUrl,
      voiceStatusCallback: `${PUBLIC_BASE_URL}/webhooks/voice-status`,
      voiceMethod: 'POST',
      voiceStatusCallbackMethod: 'POST'
    });

    res.json({ success: true, smsUrl, voiceUrl });
  } catch (error) {
    console.error('Wire webhooks error:', error);
    res.status(500).json({ error: 'Failed to wire webhooks' });
  }
});

// GET /api/available-numbers - Search for available numbers
app.get('/api/available-numbers', requireAuth, async (req, res) => {
  try {
    const { country = 'US', type = 'local', areaCode, contains } = req.query;

    let available = [];
    const searchParams = {};

    if (areaCode) searchParams.areaCode = areaCode;
    if (contains) searchParams.contains = contains;
    if (type === 'toll-free') {
      searchParams.phoneNumber = `+1800${contains || ''}`;
      available = await twilioClient.tollFree.v1.tollFreeNumbers(searchParams).fetch();
      available = available ? [available] : [];
    } else if (type === 'mobile') {
      available = await twilioClient.availablePhoneNumbers(country).mobile.list(searchParams);
    } else {
      available = await twilioClient.availablePhoneNumbers(country).local.list(searchParams);
    }

    const numbers = available.map(n => ({
      phone_number: n.phoneNumber,
      friendly_name: n.friendlyName,
      region: n.region,
      iso_country: n.isoCountry
    }));

    res.json(numbers);
  } catch (error) {
    console.error('Search numbers error:', error);
    res.status(500).json({ error: 'Failed to search numbers' });
  }
});

// POST /api/numbers/purchase - Buy a number and wire webhooks
app.post('/api/numbers/purchase', requireAuth, async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber required' });
    }

    // Purchase the number
    const number = await twilioClient.incomingPhoneNumbers.create({
      phoneNumber: phoneNumber
    });

    // Wire webhooks
    const smsUrl = `${PUBLIC_BASE_URL}/webhooks/sms`;
    const voiceUrl = `${PUBLIC_BASE_URL}/webhooks/voice`;

    await twilioClient.incomingPhoneNumbers(number.sid).update({
      smsUrl: smsUrl,
      smsStatusCallback: `${PUBLIC_BASE_URL}/webhooks/sms-status`,
      voiceUrl: voiceUrl,
      voiceStatusCallback: `${PUBLIC_BASE_URL}/webhooks/voice-status`,
      voiceMethod: 'POST',
      voiceStatusCallbackMethod: 'POST'
    });

    res.json({
      success: true,
      sid: number.sid,
      phoneNumber: number.phoneNumber,
      smsUrl,
      voiceUrl
    });
  } catch (error) {
    console.error('Purchase error:', error);
    res.status(500).json({ error: error.message || 'Failed to purchase number' });
  }
});

// DELETE /api/numbers/:sid - Release a number
app.delete('/api/numbers/:sid', requireAuth, async (req, res) => {
  try {
    const { sid } = req.params;
    await twilioClient.incomingPhoneNumbers(sid).remove();
    res.json({ success: true });
  } catch (error) {
    console.error('Release number error:', error);
    res.status(500).json({ error: 'Failed to release number' });
  }
});

// GET /api/messages - List messages
app.get('/api/messages', requireAuth, requireSupabase, async (req, res) => {
  try {
    const { number, limit = 50 } = req.query;

    let query = supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (number) {
      query = query.or(`to_number.eq.${number},from_number.eq.${number}`);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Messages list error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/messages/send - Send an SMS
app.post('/api/messages/send', requireAuth, requireSupabase, async (req, res) => {
  try {
    const { from, to, body } = req.body;
    if (!from || !to || !body) {
      return res.status(400).json({ error: 'from, to, and body required' });
    }

    // Send via Twilio
    const message = await twilioClient.messages.create({
      from: from,
      to: to,
      body: body
    });

    // Store in Supabase
    const { error: dbError } = await supabase.from('messages').insert({
      message_sid: message.sid,
      from_number: from,
      to_number: to,
      body: body,
      direction: 'outbound',
      status: message.status,
      twilio_number: from
    });

    if (dbError) console.error('DB insert error:', dbError);

    res.json({
      success: true,
      sid: message.sid,
      status: message.status
    });
  } catch (error) {
    console.error('Send SMS error:', error);
    res.status(500).json({ error: error.message || 'Failed to send message' });
  }
});

// POST /api/messages/sync - Backfill Twilio message history
app.post('/api/messages/sync', requireAuth, requireSupabase, async (req, res) => {
  try {
    const { limit = 100 } = req.body;

    const messages = await twilioClient.messages.list({ limit: parseInt(limit) });

    for (const msg of messages) {
      if (!msg.from || !msg.to) continue;

      const { error } = await supabase.from('messages').upsert({
        message_sid: msg.sid,
        from_number: msg.from,
        to_number: msg.to,
        body: msg.body || '',
        direction: msg.direction === 'inbound' ? 'inbound' : 'outbound',
        status: msg.status,
        created_at: msg.dateSent,
        twilio_number: msg.from.startsWith('+') ? msg.from : msg.to
      }, { onConflict: 'message_sid' });

      if (error) console.error('Sync insert error:', error);
    }

    res.json({ success: true, synced: messages.length });
  } catch (error) {
    console.error('Sync messages error:', error);
    res.status(500).json({ error: 'Failed to sync messages' });
  }
});

// GET /api/calls - List calls
app.get('/api/calls', requireAuth, requireSupabase, async (req, res) => {
  try {
    const { number, limit = 50 } = req.query;

    let query = supabase
      .from('calls')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (number) {
      query = query.eq('twilio_number', number);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Calls list error:', error);
    res.status(500).json({ error: 'Failed to fetch calls' });
  }
});

// POST /api/calls/dial - Initiate forward-mode call
app.post('/api/calls/dial', requireAuth, requireSupabase, async (req, res) => {
  try {
    const { from, to } = req.body;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to required' });
    }

    // Get forward_to from settings
    const { data: settings } = await supabase.from('settings').select('*').single();
    if (!settings || !settings.forward_to) {
      return res.status(400).json({ error: 'No forward number configured in settings' });
    }

    // Initiate call to user's cell first
    const bridgeUrl = `${PUBLIC_BASE_URL}/webhooks/bridge?to=${encodeURIComponent(to)}&callerId=${encodeURIComponent(from)}`;

    const call = await twilioClient.calls.create({
      from: from,
      to: settings.forward_to,
      url: bridgeUrl,
      method: 'POST'
    });

    // Record in database
    const { error: dbError } = await supabase.from('calls').insert({
      call_sid: call.sid,
      from_number: from,
      to_number: to,
      twilio_number: from,
      direction: 'outbound',
      status: call.status,
      call_mode: 'forward'
    });

    if (dbError) console.error('DB insert error:', dbError);

    res.json({
      success: true,
      sid: call.sid,
      status: call.status
    });
  } catch (error) {
    console.error('Dial error:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate call' });
  }
});

// POST /api/voice/token - Issue Twilio Voice SDK access token (also accepts GET for compatibility)
app.post('/api/voice/token', requireAuth, async (req, res) => {
  await generateVoiceToken(req, res);
});

app.get('/api/voice/token', requireAuth, async (req, res) => {
  await generateVoiceToken(req, res);
});

// Helper function to generate voice token
async function generateVoiceToken(req, res) {
  try {
    const identity = req.user.email;

    const capability = new twilio.jwt.ClientCapability({
      accountSid: TWILIO_ACCOUNT_SID,
      authToken: TWILIO_AUTH_TOKEN
    });

    // Add outgoing capability
    capability.addScope(new twilio.jwt.ClientCapability.IncomingClientScope(identity));

    // Add incoming capability for TwiML app
    capability.addScope(new twilio.jwt.ClientCapability.OutgoingClientScope({
      applicationSid: TWILIO_TWIML_APP_SID
    }));

    res.json({ token: capability.toJwt() });
  } catch (error) {
    console.error('Voice token error:', error);
    res.status(500).json({ error: 'Failed to generate voice token' });
  }
}

// GET /api/settings - Get settings
app.get('/api/settings', requireAuth, requireSupabase, async (req, res) => {
  try {
    const { data, error } = await supabase.from('settings').select('*').single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// POST /api/settings - Update settings
app.post('/api/settings', requireAuth, requireSupabase, async (req, res) => {
  try {
    const { forward_to, preferred_call_mode, default_caller_id } = req.body;

    const { data, error } = await supabase.from('settings').update({
      forward_to: forward_to || null,
      preferred_call_mode: preferred_call_mode || 'browser',
      default_caller_id: default_caller_id || null,
      updated_at: new Date().toISOString()
    }).eq('id', 1).select().single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ==================== Webhook Routes ====================

// POST /webhooks/sms - Inbound SMS
app.post('/webhooks/sms', validateTwilioSignature, requireSupabase, async (req, res) => {
  try {
    const { From, To, Body, MessageSid } = req.body;

    const { error } = await supabase.from('messages').insert({
      message_sid: MessageSid,
      from_number: From,
      to_number: To,
      body: Body,
      direction: 'inbound',
      status: 'received',
      twilio_number: To
    });

    if (error) console.error('Webhook SMS insert error:', error);

    // Return empty TwiML
    res.type('text/xml');
    res.send('<Response></Response>');
  } catch (error) {
    console.error('SMS webhook error:', error);
    res.status(500).send('Error');
  }
});

// POST /webhooks/sms-status - SMS delivery status
app.post('/webhooks/sms-status', validateTwilioSignature, requireSupabase, async (req, res) => {
  try {
    const { MessageSid, SmsStatus } = req.body;

    const { error } = await supabase.from('messages')
      .update({ status: SmsStatus })
      .eq('message_sid', MessageSid);

    if (error) console.error('SMS status update error:', error);

    res.type('text/xml');
    res.send('<Response></Response>');
  } catch (error) {
    console.error('SMS status webhook error:', error);
    res.status(500).send('Error');
  }
});

// POST /webhooks/voice - Inbound voice (forward to cell)
app.post('/webhooks/voice', validateTwilioSignature, requireSupabase, async (req, res) => {
  try {
    // Get settings for forward number
    const { data: settings } = await supabase.from('settings').select('forward_to').single();

    const forwardTo = settings?.forward_to;
    if (!forwardTo) {
      res.type('text/xml');
      res.send('<Response><Reject/></Response>');
      return;
    }

    // Return TwiML to forward
    res.type('text/xml');
    res.send(`
      <Response>
        <Dial answerOnBridge="true">
          <Number>${forwardTo}</Number>
        </Dial>
      </Response>
    `);
  } catch (error) {
    console.error('Voice webhook error:', error);
    res.status(500).send('Error');
  }
});

// POST /webhooks/bridge - Outbound bridge TwiML (for forward-mode)
app.post('/webhooks/bridge', validateTwilioSignature, requireSupabase, async (req, res) => {
  try {
    const { to, callerId } = req.query;

    res.type('text/xml');
    res.send(`
      <Response>
        <Dial callerId="${callerId}">
          <Number>${to}</Number>
        </Dial>
      </Response>
    `);
  } catch (error) {
    console.error('Bridge webhook error:', error);
    res.status(500).send('Error');
  }
});

// POST /webhooks/voice-outbound - TwiML App for browser calls
app.post('/webhooks/voice-outbound', validateTwilioSignature, requireSupabase, async (req, res) => {
  try {
    const { To, From } = req.body;

    res.type('text/xml');
    res.send(`
      <Response>
        <Dial callerId="${From}">
          <Number>${To}</Number>
        </Dial>
      </Response>
    `);
  } catch (error) {
    console.error('Voice outbound webhook error:', error);
    res.status(500).send('Error');
  }
});

// POST /webhooks/voice-status - Call status callbacks
app.post('/webhooks/voice-status', validateTwilioSignature, requireSupabase, async (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration } = req.body;

    const { error } = await supabase.from('calls')
      .update({
        status: CallStatus,
        duration: CallDuration ? parseInt(CallDuration) : 0,
        ended_at: CallStatus === 'completed' || CallStatus === 'busy' || CallStatus === 'failed' ? new Date().toISOString() : null
      })
      .eq('call_sid', CallSid);

    if (error) console.error('Voice status update error:', error);

    res.type('text/xml');
    res.send('<Response></Response>');
  } catch (error) {
    console.error('Voice status webhook error:', error);
    res.status(500).send('Error');
  }
});

module.exports = app;
