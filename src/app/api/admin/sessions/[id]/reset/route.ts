import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/verify';
import { resetAttempt } from '@/lib/db/sessions';

export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const { id } = await params;
  try {
    await resetAttempt(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Reset failed.' }, { status: 400 });
  }
}
