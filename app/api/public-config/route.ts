import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check if environment variables are set
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    // Return configuration
    return NextResponse.json({
      supabaseUrl: supabaseUrl || '',
      supabaseAnonKey: supabaseAnonKey || '',
    });
  } catch (error) {
    console.error('Public config error:', error);
    return NextResponse.json(
      { error: 'Failed to get public config' },
      { status: 500 }
    );
  }
}
