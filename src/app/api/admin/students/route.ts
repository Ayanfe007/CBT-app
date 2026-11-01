import { z } from 'zod';
import { hash } from 'bcryptjs';
import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { loginIdSchema } from '@/lib/validators';

const studentSchema = z.object({
  full_name: z.string().min(1),
  login_id: loginIdSchema.optional(),
  pin: z.string().optional(),
  is_active: z.boolean().default(true),
});

export const runtime = 'nodejs';

export async function GET() {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const { data } = await supabaseAdmin
    .from('students')
    .select('id, full_name, login_id, is_active, created_at')
    .order('full_name');
  return NextResponse.json({ students: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const parsed = studentSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
  }

  const loginId = parsed.data.login_id
    ? parsed.data.login_id.trim().toLowerCase()
    : `student_${Math.floor(1000 + Math.random() * 9000)}`;
  const pin = parsed.data.pin || Math.floor(100000 + Math.random() * 900000).toString();
  const pinHash = await hash(pin, 10);

  const { data, error } = await supabaseAdmin
    .from('students')
    .insert({
      full_name: parsed.data.full_name,
      login_id: loginId,
      pin_hash: pinHash,
      is_active: parsed.data.is_active,
    })
    .select('id, full_name, login_id, is_active')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ student: data, pin });
}
