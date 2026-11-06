import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/auth/sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  await clearSession();
  return NextResponse.redirect(new URL('/admin/login', req.url), 303);
}

export async function POST() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
