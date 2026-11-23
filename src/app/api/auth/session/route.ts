import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';

export async function GET() {
  const { user, error } = await requireSuperAdmin();
  if (error) return error;

  return NextResponse.json({ data: user });
}

