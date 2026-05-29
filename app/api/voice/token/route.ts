import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, getUserFromToken } from '@/lib/auth';
import { twilioVoiceClient } from '@/lib/twilio';

export async function GET(req: Request) {
  const token = getAuthToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 });
  }

  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  if (!twilioVoiceClient) {
    return NextResponse.json({ error: 'Twilio Voice not configured' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const identity = searchParams.get('identity') || user.email;

    const token = await twilioVoiceClient.tokens.create({ identity });

    return NextResponse.json({ token: token.toString() });
  } catch (error) {
    console.error('Voice token error:', error);
    return NextResponse.json({ error: 'Failed to generate voice token' }, { status: 500 });
  }
}
