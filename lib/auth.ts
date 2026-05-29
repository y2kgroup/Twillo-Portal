import { supabase, isAllowedEmail } from './supabase';
import type { SupabaseUser } from './types';

export async function getUserFromToken(token: string): Promise<SupabaseUser | null> {
  if (!supabase) {
    return null;
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user || !user.email) {
      return null;
    }

    // Check email allow-list
    if (!isAllowedEmail(user.email)) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
    };
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

export function getAuthToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}
