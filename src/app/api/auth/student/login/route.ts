import { z } from 'zod';
import { compare } from 'bcryptjs';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createStudentSession } from '@/lib/auth/sessions';
import { rateLimit } from '@/lib/rate-limit';
import { studentLoginSchema } from '@/lib/validators';

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required');
}

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { allowed } = rateLimit(`student-login:${ip}`, { max: 20, windowMs: 60 * 1000 });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 }
    );
  }

  console.log('[student-login] received body keys:', Object.keys(body ?? {}));

  const parsed = studentLoginSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    console.log('[student-login] zod validation failed:', issues);
    return NextResponse.json(
      { error: 'Validation failed.', issues },
      { status: 400 }
    );
  }

  const { loginId, pin } = parsed.data;

  const { data: student, error } = await supabaseAdmin
    .from('students')
    .select('id, pin_hash, is_active')
    .eq('login_id', loginId)
    .maybeSingle();

  if (error) {
    console.log('[student-login] supabase error:', error.message);
    return NextResponse.json({ error: 'Invalid login ID or PIN.' }, { status: 401 });
  }

  if (!student || !student.is_active) {
    return NextResponse.json({ error: 'Invalid login ID or PIN.' }, { status: 401 });
  }

  const valid = await compare(pin, student.pin_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid login ID or PIN.' }, { status: 401 });
  }

  await createStudentSession(student.id);
  return NextResponse.json({ ok: true, studentId: student.id });
}
