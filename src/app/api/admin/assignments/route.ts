import { z } from 'zod';
import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';

const assignSchema = z.object({
  studentIds: z.array(z.string().uuid()),
  courseId: z.string().uuid(),
  attempts_override: z.coerce.number().int().nonnegative().optional().nullable(),
});

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const { data } = await supabaseAdmin
    .from('course_assignments')
    .select('*, students(full_name, login_id), courses(course_code, title)')
    .order('students(full_name)');
  return NextResponse.json({ assignments: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const parsed = assignSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
  }

  const rows = parsed.data.studentIds.map((sid) => ({
    student_id: sid,
    course_id: parsed.data.courseId,
    attempts_override: parsed.data.attempts_override,
  }));

  const { error } = await supabaseAdmin.from('course_assignments').upsert(rows, {
    onConflict: 'student_id, course_id',
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('student_id');
  const courseId = searchParams.get('course_id');
  if (!studentId || !courseId) {
    return NextResponse.json({ error: 'student_id and course_id required.' }, { status: 400 });
  }
  const { error } = await supabaseAdmin
    .from('course_assignments')
    .delete()
    .eq('student_id', studentId)
    .eq('course_id', courseId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
