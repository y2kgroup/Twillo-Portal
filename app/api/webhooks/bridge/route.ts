import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateTwilioSignature } from '@/lib/webhook-validator';

export async function POST(req: NextRequest) {
  // Validate Twilio signature
  const url = `${process.env.PUBLIC_BASE_URL}/api/webhooks/bridge`;
  const signature = req.headers.get('x-twilio-signature');
  const body = await req.json();

  if (!validateTwilioSignature(url, signature, body)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  try {
    const { DialCallStatus, DialBridgestatus, CallSid, ForwardedFrom } = body;

    // Update call status in database
    if (supabase) {
      const { error } = await supabase
        .from('calls')
        .update({
          status: DialCallStatus || DialBridgestatus || 'unknown',
        })
        .eq('call_sid', CallSid);

      if (error) console.error('Bridge webhook error:', error);
    }

    // Return TwiML response to continue the call
    let twiml = '<?xml version="1.0" encoding="UTF-8"?><Response>';

    if (DialCallStatus === 'completed' || DialBridgestatus === 'completed') {
      // Call was successful, play a tone and hangup
      twiml += '<Play></Play>';
    }

    twiml += '</Response>';

    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('Bridge webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
