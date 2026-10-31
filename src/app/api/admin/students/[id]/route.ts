import { z } from 'zod';
import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';

const updateSchema = z.object({
  full_name: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
});

export const runtime = 'nodejs';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from('students')
    .update(parsed.data)
    .eq('id', id)
    .select('id, full_name, login_id, is_active')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  }
  return NextResponse.json({ student: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const { id } = await params;
  const { error } = await supabaseAdmin.from('students').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
