import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function GET() {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const supabase = getSupabaseAdmin();
  const { data, error: dbError } = await supabase
    .from('programs')
    .select('*')
    .order('created_at', { ascending: false });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const body = await request.json();
  const { name, description, status } = body;

  if (!name || typeof name !== 'string') {
    return NextResponse.json(
      { error: 'Name is required' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error: dbError } = await supabase
    .from('programs')
    .insert({
      name: name.trim(),
      description: description?.trim() || null,
      status: status || 'active',
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
  const { id, name, description, status } = body;

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error: dbError } = await supabase
    .from('programs')
    .update({
      name: name?.trim(),
      description: description?.trim() || null,
      status,
      updated_at: new Date().toISOString(),
    })
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
  const { error: dbError } = await supabase
    .from('programs')
    .delete()
    .eq('id', id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'Deleted' });
}

