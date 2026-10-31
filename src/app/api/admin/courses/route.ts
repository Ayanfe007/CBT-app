import { z } from 'zod';
import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';

const courseSchema = z.object({
  course_code: z.string().min(1),
  title: z.string().min(1),
  duration_minutes: z.coerce.number().int().positive().default(30),
  questions_per_test: z.coerce.number().int().nonnegative().optional().nullable(),
  pass_mark_percent: z.coerce.number().int().min(0).max(100).default(50),
  max_attempts: z.coerce.number().int().positive().default(1),
  is_active: z.boolean().default(true),
  show_result_to_student: z.boolean().default(true),
  show_review_to_student: z.boolean().default(true),
  max_pause_minutes: z.coerce.number().int().nonnegative().default(20),
});

export const runtime = 'nodejs';

export async function GET() {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const { data } = await supabaseAdmin
    .from('courses')
    .select('*')
    .order('course_code');
  return NextResponse.json({ courses: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const parsed = courseSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from('courses')
    .insert(parsed.data)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ course: data });
}
