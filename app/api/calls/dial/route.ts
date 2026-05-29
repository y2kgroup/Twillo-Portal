import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, getUserFromToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
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

  if (!supabase || !twilioClient) {
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { from, to, mode } = body;

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get user settings to determine forward number
    const { data: settings } = await supabase
      .from('settings')
      .select('forward_to')
      .eq('user_email', user.email)
      .single();

    const forwardTo = settings?.forward_to;

    if (mode === 'forward' && forwardTo) {
      // Forward mode: call user's phone first, then connect to destination
      const call = await twilioClient.calls.create({
        from,
        to: forwardTo,
        url: getWebhookUrl('/api/webhooks/bridge'),
        statusCallback: getWebhookUrl('/api/webhooks/voice-status'),
        statusCallbackEvent: ['completed', 'busy', 'failed', 'no-answer', 'canceled'],
        statusCallbackMethod: 'POST',
      });

      // Store in database
      const { error: dbError } = await supabase.from('calls').insert({
        call_sid: call.sid,
        from_number: from,
        to_number: to,
        direction: 'outbound',
        status: call.status,
      });

      if (dbError) console.error('Call storage error:', dbError);

      return NextResponse.json({ sid: call.sid, status: call.status });
    } else {
      // Browser mode: return error - browser mode not implemented in MVP
      return NextResponse.json({ error: 'Browser mode not implemented' }, { status: 400 });
    }
  } catch (error) {
    console.error('Call dial error:', error);
    return NextResponse.json({ error: 'Failed to initiate call' }, { status: 500 });
  }
}
