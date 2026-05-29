import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, getUserFromToken } from '@/lib/auth';
import { twilioClient } from '@/lib/twilio';

export async function GET(req: Request) {
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
    const incomingNumbers = await twilioClient.incomingPhoneNumbers.list();
    const numbers = incomingNumbers.map(n => ({
      sid: n.sid,
      phone_number: n.phoneNumber,
      friendly_name: n.friendlyName,
      capabilities: {
        voice: n.capabilities.voice || false,
        sms: n.capabilities.sms || false,
        mms: n.capabilities.mms || false,
      },
    }));
    return NextResponse.json(numbers);
  } catch (error) {
    console.error('Numbers fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch numbers' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
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
    const { searchParams } = new URL(req.url);
    const sid = searchParams.get('sid');

    if (!sid) {
      return NextResponse.json({ error: 'Missing SID' }, { status: 400 });
    }

    await twilioClient.incomingPhoneNumbers(sid).remove();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Number release error:', error);
    return NextResponse.json({ error: 'Failed to release number' }, { status: 500 });
  }
}
