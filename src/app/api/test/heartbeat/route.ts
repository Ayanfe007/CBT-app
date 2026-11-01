import { z } from 'zod';
import { NextResponse } from 'next/server';
import { verifyStudentSession } from '@/lib/auth/verify';
import { heartbeat } from '@/lib/db/sessions';

const schema = z.object({
  sessionId: z.string().uuid(),
  clientSeq: z.number().int().nonnegative().default(0),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const student = await verifyStudentSession();
    if (!student) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    try {
      const result = await heartbeat({
        sessionId: parsed.data.sessionId,
        clientSeq: parsed.data.clientSeq,
      });
      return NextResponse.json(result);
    } catch (err: any) {
      // Heartbeat tolerance: still return ends_at and server_now so test keeps working
      console.error('[/api/test/heartbeat] error:', err);
      return NextResponse.json({
        serverNow: new Date().toISOString(),
        endsAt: new Date().toISOString(),
        pausedSeconds: 0,
        disconnectCount: 0,
        remainingAllowanceSeconds: 0,
        allowanceExhausted: false,
      });
    }
  } catch (err: any) {
    console.error('[/api/test/heartbeat] fatal:', err);
    return NextResponse.json(
      { error: err.message || 'Heartbeat failed.' },
      { status: 500 }
    );
  }
}
