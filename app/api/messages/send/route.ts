import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, getUserFromToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { twilioClient } from '@/lib/twilio';

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
    const { from, to, body: message } = body;

    if (!from || !to || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Send via Twilio
    const twilioMessage = await twilioClient.messages.create({
      from,
      to,
      body: message,
    });

    // Store in Supabase
    const { error: dbError } = await supabase.from('messages').insert({
      message_sid: twilioMessage.sid,
      from_number: from,
      to_number: to,
      body: message,
      direction: 'outbound',
      status: twilioMessage.status,
    });

    if (dbError) console.error('Message storage error:', dbError);

    return NextResponse.json({
      sid: twilioMessage.sid,
      status: twilioMessage.status,
    });
  } catch (error) {
    console.error('Message send error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
