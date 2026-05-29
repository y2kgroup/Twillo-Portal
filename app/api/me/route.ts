import { NextResponse } from 'next/server';
import { getAuthToken, getUserFromToken } from '@/lib/auth';

export async function GET(req: Request) {
  const token = getAuthToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 });
  }

  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  return NextResponse.json({ email: user.email, authorized: true });
}
