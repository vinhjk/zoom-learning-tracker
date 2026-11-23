import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const programId = searchParams.get('program_id');

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('sessions')
    .select('*, programs(name)')
    .order('scheduled_start', { ascending: false });

  if (programId) {
    query = query.eq('program_id', programId);
  }

  const { data, error: dbError } = await query;

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // Flatten program name
  const sessions = (data || []).map((s: Record<string, unknown>) => ({
    ...s,
    program_name: (s.programs as Record<string, unknown>)?.name || null,
    programs: undefined,
  }));

  return NextResponse.json({ data: sessions });
}

export async function POST(request: Request) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const body = await request.json();
  const { program_id, title, zoom_meeting_id, scheduled_start, scheduled_end, duration_minutes } =
    body;

  if (!program_id || !title) {
    return NextResponse.json(
      { error: 'program_id and title are required' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error: dbError } = await supabase
    .from('sessions')
    .insert({
      program_id,
      title: title.trim(),
      zoom_meeting_id: zoom_meeting_id?.trim() || null,
      scheduled_start: scheduled_start || null,
      scheduled_end: scheduled_end || null,
      duration_minutes: duration_minutes || null,
      status: 'scheduled',
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

export async function PUT(request: Request) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error: dbError } = await supabase
    .from('sessions')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(request: Request) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error: dbError } = await supabase.from('sessions').delete().eq('id', id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'Deleted' });
}

