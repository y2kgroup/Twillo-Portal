import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const apiKeySid = process.env.TWILIO_API_KEY_SID;
const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;

const isValidTwilioCreds = accountSid && accountSid.startsWith('AC') && authToken;

// Main client for SMS and number management
export const twilioClient = isValidTwilioCreds
  ? twilio(accountSid, authToken)
  : null;

// Voice client for browser-based calls
export const twilioVoiceClient = isValidTwilioCreds && apiKeySid && apiKeySecret
  ? twilio(apiKeySid, apiKeySecret, { accountSid })
  : null;
