import { NextResponse } from 'next/server';
import { verifyStudentSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { finalizeExpiredSessions } from '@/lib/db/grading';
import { markAbandoned } from '@/lib/db/sessions';
import { toQuestionView, orderQuestions, type QuestionView } from '@/lib/questionView';

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

    try {
      await finalizeExpiredSessions();
    } catch {
      // best-effort
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

    // Check abandon rule.
    const { data: course } = await supabaseAdmin
      .from('courses')
      .select('abandon_after_minutes')
      .eq('id', session.course_id)
      .maybeSingle();
    const abandonAfterMinutes = (course as any)?.abandon_after_minutes ?? 60;
    const now = new Date();
    const lastHb = session.last_heartbeat_at ? new Date(session.last_heartbeat_at).getTime() : null;
    const startedAt = session.started_at ? new Date(session.started_at).getTime() : null;
    const referenceMs = lastHb ?? startedAt ?? now.getTime();
    const inactiveMinutes = (now.getTime() - referenceMs) / 60000;

    if (abandonAfterMinutes > 0 && inactiveMinutes > abandonAfterMinutes) {
      await markAbandoned(sessionId);
      return NextResponse.json({
        status: 'finished',
        sessionId: session.id,
        resultId: null,
        submitType: 'abandoned',
        submittedAt: now.toISOString(),
      });
    }

    const questionOrder = (session.question_order as string[]) ?? [];
    const { data: questions } = await supabaseAdmin
      .from('questions')
      .select('id, question_text, option_a, option_b, option_c, option_d')
      .in('id', questionOrder)
      .order('created_at');

    // Options always display A-D exactly as the admin entered them.
    const questionsOut: QuestionView[] = orderQuestions(questionOrder, questions as any[]).map(
      toQuestionView,
    );

    // Convert answers from { letter, seq } to flat letter map.
    const rawAnswers = (session.answers as Record<string, { letter: string }> | null) ?? {};
    const answers: Record<string, string> = {};
    Object.entries(rawAnswers).forEach(([qId, v]) => {
      answers[qId] = v.letter;
    });

    return NextResponse.json({
      status: 'active',
      sessionId: session.id,
      endsAt: session.ends_at,
      serverNow: new Date().toISOString(),
      questions: questionsOut,
      questionOrder,
      submittedAt: session.submitted_at,
      answers,
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
