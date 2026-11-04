import { z } from 'zod';
import { NextResponse } from 'next/server';
import { verifyStudentSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { gradeSession } from '@/lib/db/grading';
import { saveAnswers, markSubmitted } from '@/lib/db/sessions';

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
      .select('id, student_id, submitted_at, submit_type, ends_at, course_id')
      .eq('id', parsed.data.sessionId)
      .maybeSingle();

    if (fetchErr || !session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    if (session.student_id !== student.studentId) {
      return NextResponse.json({ error: 'Not your session.' }, { status: 403 });
    }

    // Idempotent: if already submitted, return the existing result.
    if (session.submitted_at) {
      const { data: result } = await supabaseAdmin
        .from('test_results')
        .select('*')
        .eq('session_id', parsed.data.sessionId)
        .maybeSingle();
      return NextResponse.json({
        ok: true,
        alreadySubmitted: true,
        submittedAt: session.submitted_at,
        submitType: session.submit_type,
        graded: result
          ? {
              sessionId: parsed.data.sessionId,
              studentId: result.student_id,
              courseId: result.course_id,
              score: result.score,
              totalQuestions: result.total_questions,
              percentage: Number(result.percentage),
              passed: result.passed,
              timeTakenSeconds: result.time_taken_seconds,
              submitType: result.submit_type,
              pausedSeconds: result.paused_seconds ?? 0,
              disconnectCount: result.disconnect_count ?? 0,
              answers: {},
              questionOrder: [],
              optionOrders: {},
            }
          : null,
      });
    }

    // Save incoming answers (merge with existing).
    await saveAnswers({
      sessionId: parsed.data.sessionId,
      answers: parsed.data.answers,
      clientSeq: parsed.data.clientSeq,
    });

    // If expired, still grade from saved answers — do not reject.
    const now = new Date();
    const endsAt = new Date(session.ends_at).getTime();
    const graceMs = 10 * 1000;
    const expired = now.getTime() > endsAt + graceMs;

    const submittedAt = now.toISOString();
    const answersByLetter: Record<string, string> = {};
    for (const [qId, entry] of Object.entries(parsed.data.answers)) {
      answersByLetter[qId] = entry.letter;
    }

    const submitType = 'manual';
    await markSubmitted({
      sessionId: parsed.data.sessionId,
      submitType: submitType as 'manual',
      submittedAt,
      answers: answersByLetter,
    });

    const graded = await gradeSession(parsed.data.sessionId);

    return NextResponse.json({
      ok: true,
      submittedAt,
      expired,
      graded,
    });
  } catch (err: any) {
    console.error('[/api/test/submit] error:', err);
    return NextResponse.json(
      { error: err.message || 'Submit failed.' },
      { status: 500 }
    );
  }
}
