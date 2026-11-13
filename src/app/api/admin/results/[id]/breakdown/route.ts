import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { classifyStoredAnswer, normalizeStoredAnswers } from '@/lib/answers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await verifyAdminSession())) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const { id } = await params;
    const { data: result, error: resultErr } = await supabaseAdmin
      .from('test_results')
      .select('*, students(full_name, login_id), courses(course_code, title)')
      .eq('id', id)
      .maybeSingle();

    if (resultErr) throw resultErr;
    if (!result) {
      return NextResponse.json({ error: 'Result not found.' }, { status: 404 });
    }

    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('test_sessions')
      .select('question_order, answers')
      .eq('id', result.session_id)
      .maybeSingle();

    if (sessionErr) throw sessionErr;
    if (!session) {
      return NextResponse.json({ error: 'Test session not found.' }, { status: 404 });
    }

    const { data: questions, error: questionsErr } = await supabaseAdmin
      .from('questions')
      .select('id, question_text, option_a, option_b, option_c, option_d, correct_option')
      .eq('course_id', result.course_id);

    if (questionsErr) throw questionsErr;

    const questionOrder = (session.question_order as string[] | null) ?? [];
    const rawAnswerMap =
      session.answers && typeof session.answers === 'object' && !Array.isArray(session.answers)
        ? session.answers as Record<string, unknown>
        : {};
    const answers = normalizeStoredAnswers(rawAnswerMap);
    const qMap = new Map((questions ?? []).map((q) => [q.id, q]));

    const breakdown = questionOrder.flatMap((qId: string, idx: number) => {
      const q = qMap.get(qId);
      if (!q) return [];

      const studentAnswer = answers[qId]?.letter ?? null;
      const correctAnswer = q.correct_option ?? null;
      const rawKind = classifyStoredAnswer(rawAnswerMap[qId]);
      const answerStatus = rawKind === 'unrecognized'
        ? 'unrecognized'
        : rawKind === 'missing'
          ? 'unanswered'
          : studentAnswer === correctAnswer
            ? 'correct'
            : 'incorrect';

      return [{
        questionNumber: idx + 1,
        questionText: q.question_text ?? '',
        studentAnswer,
        correctAnswer,
        answerStatus,
        isCorrect: answerStatus === 'correct',
        // Always show choices as entered: A-D map directly to option_a-option_d.
        options: {
          A: q.option_a ?? '',
          B: q.option_b ?? '',
          C: q.option_c ?? '',
          D: q.option_d ?? '',
        },
      }];
    });

    const questionIdSet = new Set(questionOrder);
    const savedAnswerKeys = Object.keys(rawAnswerMap);
    const answered = breakdown.filter((item) => item.answerStatus === 'correct' || item.answerStatus === 'incorrect').length;
    const unanswered = breakdown.filter((item) => item.answerStatus === 'unanswered').length;
    const unrecognized = breakdown.filter((item) => item.answerStatus === 'unrecognized').length;
    const answerSummary = {
      total: questionOrder.length,
      answered,
      unanswered,
      unrecognized,
      orphaned: savedAnswerKeys.filter((qId) => !questionIdSet.has(qId)).length,
    };

    return NextResponse.json({ result, breakdown, answerSummary });
  } catch (err: any) {
    console.error('[/api/admin/results/[id]/breakdown] error:', err);
    return NextResponse.json(
      { error: err?.message || 'Could not load result breakdown.' },
      { status: 500 }
    );
  }
}
