import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, getUserFromToken } from '@/lib/auth';
import { twilioClient } from '@/lib/twilio';
import { getWebhookUrl } from '@/lib/webhook-validator';

export async function POST(req: Request) {
  const token = getAuthToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 });
  }

  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  if (!twilioClient) {
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { phoneNumber, friendlyName } = body;

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Missing phone number' }, { status: 400 });
    }

    // Purchase the number
    const number = await twilioClient.incomingPhoneNumbers.create({
      phoneNumber,
      friendlyName: friendlyName || phoneNumber,
      smsUrl: getWebhookUrl('/api/webhooks/sms'),
      voiceUrl: getWebhookUrl('/api/webhooks/voice'),
    });

    return NextResponse.json({
      sid: number.sid,
      phone_number: number.phoneNumber,
      friendly_name: number.friendlyName,
      capabilities: {
        voice: number.capabilities.voice || false,
        sms: number.capabilities.sms || false,
        mms: number.capabilities.mms || false,
      },
    });
  } catch (error) {
    console.error('Number purchase error:', error);
    return NextResponse.json({ error: 'Failed to purchase number' }, { status: 500 });
  }
}
