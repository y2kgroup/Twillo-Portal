import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateTwilioSignature } from '@/lib/webhook-validator';

export async function POST(req: NextRequest) {
  // Validate Twilio signature
  const url = `${process.env.PUBLIC_BASE_URL}/api/webhooks/voice`;
  const signature = req.headers.get('x-twilio-signature');
  const body = await req.json();

  if (!validateTwilioSignature(url, signature, body)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const { From, To, CallSid, CallerId } = body;

    // Get user settings for forward number
    const { data: settings } = await supabase
      .from('settings')
      .select('forward_to')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    const forwardTo = settings?.forward_to;

    // Store incoming call
    const { error } = await supabase.from('calls').insert({
      call_sid: CallSid,
      from_number: From,
      to_number: To,
      direction: 'inbound',
      status: 'ringing',
    });

    if (error) console.error('Voice webhook storage error:', error);

    // Return TwiML response to forward the call
    let twiml = '<?xml version="1.0" encoding="UTF-8"?><Response>';

    if (forwardTo) {
      twiml += `<Dial callerId="${To}">${forwardTo}</Dial>`;
    } else {
      twiml += '<Say>No forwarding number configured. Goodbye.</Say>';
      twiml += '<Hangup />';
    }

    twiml += '</Response>';

    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('Voice webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
