import { z } from 'zod';
import { NextResponse } from 'next/server';
import { verifyStudentSession } from '@/lib/auth/verify';
import { saveAnswers } from '@/lib/db/sessions';

const answerEntry = z.object({ letter: z.string().min(1), seq: z.number().int().nonnegative() });
const schema = z.object({
  sessionId: z.string().uuid(),
  answers: z.record(z.string(), answerEntry),
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
      const result = await saveAnswers({
        sessionId: parsed.data.sessionId,
        answers: parsed.data.answers,
        clientSeq: parsed.data.clientSeq,
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (err: any) {
      console.error('[/api/test/answers] error:', err);
      return NextResponse.json({ error: err.message || 'Save failed.' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[/api/test/answers] fatal:', err);
    return NextResponse.json({ error: err.message || 'Save failed.' }, { status: 500 });
  }
}
