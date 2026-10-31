import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createAdminSession } from '@/lib/auth/sessions';
import { rateLimit } from '@/lib/rate-limit';

const schema = z.object({ password: z.string().min(1) });

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { allowed } = rateLimit(`admin-login:${ip}`, { max: 10, windowMs: 60 * 1000 });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (parsed.data.password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Invalid admin password.' }, { status: 401 });
  }

  await createAdminSession();
  return NextResponse.json({ ok: true });
}
