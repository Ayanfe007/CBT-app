import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/verify';
import { regradeAllResults } from '@/lib/db/grading';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const summary = await regradeAllResults();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err: any) {
    console.error('[/api/admin/results/regrade] error:', err);
    return NextResponse.json(
      { error: err.message || 'Regrade failed.' },
      { status: 500 }
    );
  }
}
