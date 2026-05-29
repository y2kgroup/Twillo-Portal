import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateTwilioSignature } from '@/lib/webhook-validator';

export async function POST(req: NextRequest) {
  // Validate Twilio signature
  const url = `${process.env.PUBLIC_BASE_URL}/api/webhooks/sms`;
  const signature = req.headers.get('x-twilio-signature');
  const body = await req.json();

  if (!validateTwilioSignature(url, signature, body)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const { From, To, Body, MessageSid, FromCity, FromState, FromCountry } = body;

    // Store incoming message
    const { error } = await supabase.from('messages').insert({
      message_sid: MessageSid,
      from_number: From,
      to_number: To,
      body: Body,
      direction: 'inbound',
      status: 'received',
    });

    if (error) console.error('SMS webhook storage error:', error);

    // Return TwiML response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('SMS webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
