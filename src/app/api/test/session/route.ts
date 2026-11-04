import { NextResponse } from 'next/server';
import { verifyStudentSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { finalizeExpiredSessions } from '@/lib/db/grading';
import { markAbandoned } from '@/lib/db/sessions';

interface QuestionOut {
  id: string;
  question_text: string;
  options: { A: string; B: string; C: string; D: string };
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const student = await verifyStudentSession();
    if (!student) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required.' }, { status: 400 });
    }

    // Finalize any expired/abandoned sessions before returning data.
    // This is idempotent and safe to call on every load.
    try {
      await finalizeExpiredSessions();
    } catch {
      // best-effort; continue to load this specific session
    }

    const { data: session, error: fetchErr } = await supabaseAdmin
      .from('test_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (fetchErr || !session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    if (session.student_id !== student.studentId) {
      return NextResponse.json({ error: 'Not your session.' }, { status: 403 });
    }

    // If already submitted (manual, auto_timeout, or abandoned), return finished.
    if (session.submitted_at) {
      let resultId: string | null = null;
      if (session.submit_type !== 'abandoned') {
        const { data: result } = await supabaseAdmin
          .from('test_results')
          .select('id')
          .eq('session_id', sessionId)
          .maybeSingle();
        resultId = result?.id ?? null;
      }
      return NextResponse.json({
        status: 'finished',
        sessionId: session.id,
        resultId,
        submitType: session.submit_type,
        submittedAt: session.submitted_at,
      });
    }

    const { data: questions } = await supabaseAdmin
      .from('questions')
      .select('id, question_text, option_a, option_b, option_c, option_d')
      .eq('course_id', session.course_id);

    const qMap = new Map((questions ?? []).map((q) => [q.id, q]));
    const questionOrder = (session.question_order as string[]) ?? [];
    const optionOrders = (session.option_orders as Record<string, string[]>) ?? {};

    const questionsOut: QuestionOut[] = questionOrder.map((id) => {
      const q = qMap.get(id);
      if (!q) return null;
      const shuffled = optionOrders[id] ?? ['A', 'B', 'C', 'D'];
      const letterToText: Record<string, string> = {
        A: q.option_a,
        B: q.option_b,
        C: q.option_c,
        D: q.option_d,
      };
      return {
        id: q.id,
        question_text: q.question_text,
        options: {
          A: letterToText[shuffled[0]],
          B: letterToText[shuffled[1]],
          C: letterToText[shuffled[2]],
          D: letterToText[shuffled[3]],
        },
      } as QuestionOut;
    }).filter(Boolean) as QuestionOut[];

    const answers = (session.answers as Record<string, { letter: string }> | null) ?? {};
    const answersByLetter: Record<string, string> = {};
    Object.entries(answers).forEach(([qId, v]) => {
      answersByLetter[qId] = v.letter;
    });

    return NextResponse.json({
      status: 'active',
      sessionId: session.id,
      endsAt: session.ends_at,
      serverNow: new Date().toISOString(),
      questions: questionsOut,
      questionOrder,
      optionOrders,
      submittedAt: session.submitted_at,
      answers: answersByLetter,
      pausedSeconds: session.paused_seconds ?? 0,
    });
  } catch (err: any) {
    console.error('[/api/test/session] error:', err);
    return NextResponse.json(
      { error: err.message || 'Could not load session.' },
      { status: 500 }
    );
  }
}
