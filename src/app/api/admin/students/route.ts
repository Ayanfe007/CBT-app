import { z } from 'zod';
import { hash } from 'bcryptjs';
import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';

const studentSchema = z.object({
  full_name: z.string().min(1),
  login_id: z.string().min(1).optional(),
  pin: z.string().min(4).max(6).optional(),
  is_active: z.boolean().default(true),
});

function generateLoginId(fullName: string): string {
  const base = fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${base}_${Math.floor(1000 + Math.random() * 9000)}`;
}

function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

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

  const loginId = parsed.data.login_id || generateLoginId(parsed.data.full_name);
  const pin = parsed.data.pin || generatePin();
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

  // Return the PIN once — it is stored hashed only.
  return NextResponse.json({ student: data, pin });
}
