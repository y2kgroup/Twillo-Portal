import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, getUserFromToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// GET - List calls
export async function GET(req: Request) {
  const token = getAuthToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 });
  }

  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const number = searchParams.get('number');

    let query = supabase
      .from('calls')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (number) {
      query = query.or(`from_number.eq.${number},to_number.eq.${number}`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Calls fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch calls' }, { status: 500 });
  }
}
