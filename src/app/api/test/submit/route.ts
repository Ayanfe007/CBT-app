import { z } from 'zod';
import { NextResponse } from 'next/server';
import { verifyStudentSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { gradeSession } from '@/lib/db/grading';
import { markSubmitted } from '@/lib/db/sessions';

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

    const { data: session, error: fetchErr } = await supabaseAdmin
      .from('test_sessions')
      .select('id, student_id, submitted_at, ends_at, course_id')
      .eq('id', parsed.data.sessionId)
      .maybeSingle();

    if (fetchErr || !session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    if (session.student_id !== student.studentId) {
      return NextResponse.json({ error: 'Not your session.' }, { status: 403 });
    }
    if (session.submitted_at) {
      return NextResponse.json({ error: 'Already submitted.' }, { status: 409 });
    }

    const now = new Date();
    const endsAt = new Date(session.ends_at).getTime();
    const graceMs = 10 * 1000;
    if (now.getTime() > endsAt + graceMs) {
      return NextResponse.json(
        { error: 'Time has expired. Your test will be auto-graded from saved answers.' },
        { status: 410 }
      );
    }

    await saveAnswers({
      sessionId: parsed.data.sessionId,
      answers: parsed.data.answers,
      clientSeq: parsed.data.clientSeq,
    });

    const submittedAt = now.toISOString();
    const answersByLetter: Record<string, string> = {};
    for (const [qId, entry] of Object.entries(parsed.data.answers)) {
      answersByLetter[qId] = entry.letter;
    }

    await markSubmitted({
      sessionId: parsed.data.sessionId,
      submitType: 'manual',
      submittedAt,
      answers: answersByLetter,
    });

    const graded = await gradeSession(parsed.data.sessionId);

    return NextResponse.json({ ok: true, submittedAt, graded });
  } catch (err: any) {
    console.error('[/api/test/submit] error:', err);
    return NextResponse.json(
      { error: err.message || 'Submit failed.' },
      { status: 500 }
    );
  }
}
