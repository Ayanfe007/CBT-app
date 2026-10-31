import { z } from 'zod';
import { hash } from 'bcryptjs';
import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';

function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const { id } = await params;
  const pin = generatePin();
  const pinHash = await hash(pin, 10);

  const { data, error } = await supabaseAdmin
    .from('students')
    .update({ pin_hash: pinHash })
    .eq('id', id)
    .select('id, full_name, login_id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  }

  // Return the new PIN once.
  return NextResponse.json({ student: data, pin });
}
