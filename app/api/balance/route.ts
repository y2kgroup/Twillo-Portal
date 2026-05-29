import { NextResponse } from 'next/server';
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
    const account = await twilioClient.api.v2010.accounts(process.env.TWILIO_ACCOUNT_SID!).fetch();
    return NextResponse.json({
      balance: account.balance,
      currency: account.currency,
    });
  } catch (error) {
    console.error('Balance fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 });
  }
}
