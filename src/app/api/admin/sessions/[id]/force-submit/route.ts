import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/verify';
import { forceSubmit } from '@/lib/db/sessions';

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
    await forceSubmit(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Force submit failed.' }, { status: 400 });
  }
}
