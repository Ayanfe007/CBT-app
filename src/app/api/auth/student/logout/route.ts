import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/auth/sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sign out link (GET): clear the cookie, then send the browser to the login page
// instead of showing raw JSON.
export async function GET(req: Request) {
  await clearSession();
  return NextResponse.redirect(new URL('/login', req.url), 303);
}

// Programmatic sign out (fetch POST): keep returning JSON.
export async function POST() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
