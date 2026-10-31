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
  const session = await verifyStudentSession();
  if (!session) {
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
    return NextResponse.json({ error: err.message || 'Heartbeat failed.' }, { status: 400 });
  }
}
