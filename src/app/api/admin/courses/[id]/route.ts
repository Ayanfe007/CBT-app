import { z } from 'zod';
import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';

const courseSchema = z.object({
  course_code: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  duration_minutes: z.coerce.number().int().positive().optional(),
  questions_per_test: z.coerce.number().int().nonnegative().optional().nullable(),
  pass_mark_percent: z.coerce.number().int().min(0).max(100).optional(),
  max_attempts: z.coerce.number().int().positive().optional(),
  is_active: z.boolean().optional(),
  show_result_to_student: z.boolean().optional(),
  show_review_to_student: z.boolean().optional(),
  max_pause_minutes: z.coerce.number().int().nonnegative().optional(),
});

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from('courses')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  }
  return NextResponse.json({ course: data });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const { id } = await params;
  const parsed = courseSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from('courses')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single();
  if (error || !data) {
    return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  }
  return NextResponse.json({ course: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const { id } = await params;
  const { error } = await supabaseAdmin.from('courses').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
