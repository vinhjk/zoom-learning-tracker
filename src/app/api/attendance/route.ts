import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('session_id');

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('attendance_records')
    .select('*, participants(name, email), sessions(title)')
    .order('join_time', { ascending: true });

  if (sessionId) {
    query = query.eq('session_id', sessionId);
  }

  const { data, error: dbError } = await query;

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // Flatten joined data
  const records = (data || []).map((r: Record<string, unknown>) => ({
    ...r,
    participant_name: (r.participants as Record<string, unknown>)?.name || null,
    participant_email: (r.participants as Record<string, unknown>)?.email || null,
    session_title: (r.sessions as Record<string, unknown>)?.title || null,
    participants: undefined,
    sessions: undefined,
  }));

  return NextResponse.json({ data: records });
}

