import crypto from 'crypto';

const publicBaseUrl = process.env.PUBLIC_BASE_URL || '';

export function validateTwilioSignature(
  url: string,
  signature: string | null,
  params: Record<string, any>
): boolean {
  if (!signature) {
    return false;
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return false;
  }

  // Sort parameters and concatenate
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}${params[key]}`)
    .join('');

  const data = url + sortedParams;
  const computedSignature = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');

  return signature === computedSignature;
}

export function getWebhookUrl(path: string): string {
  return `${publicBaseUrl}${path}`;
}
