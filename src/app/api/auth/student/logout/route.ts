import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/auth/sessions';

export const runtime = 'nodejs';

async function handler() {
  await clearSession();
  return NextResponse.json({ ok: true });
}

export const GET = handler;
export const POST = handler;
