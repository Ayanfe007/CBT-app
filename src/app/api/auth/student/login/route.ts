import { z } from 'zod';
import { compare } from 'bcryptjs';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createStudentSession } from '@/lib/auth/sessions';
import { rateLimit } from '@/lib/rate-limit';

const schema = z.object({
  loginId: z.string().min(1, 'Login ID is required'),
  pin: z.string().min(1, 'PIN is required'),
});

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { allowed } = rateLimit(`student-login:${ip}`, { max: 20, windowMs: 60 * 1000 });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { loginId, pin } = parsed.data;

  const { data: student, error } = await supabaseAdmin
    .from('students')
    .select('id, pin_hash, is_active')
    .eq('login_id', loginId)
    .maybeSingle();

  if (error || !student || !student.is_active) {
    return NextResponse.json({ error: 'Invalid login ID or PIN.' }, { status: 401 });
  }

  const valid = await compare(pin, student.pin_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid login ID or PIN.' }, { status: 401 });
  }

  await createStudentSession(student.id);
  return NextResponse.json({ ok: true, studentId: student.id });
}
