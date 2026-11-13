import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/verify';
import { regradeSession } from '@/lib/db/grading';
import { normalizeStoredAnswers } from '@/lib/answers';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
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
      .select('id, session_id, submit_type')
      .eq('id', id)
      .maybeSingle();

    if (resultErr) throw resultErr;
    if (!result) {
      return NextResponse.json({ error: 'Result not found.' }, { status: 404 });
    }
    if (result.submit_type === 'abandoned') {
      return NextResponse.json({ error: 'Abandoned attempts do not have grades to regrade.' }, { status: 400 });
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

    const questionOrder = (session.question_order as string[] | null) ?? [];
    const rawAnswerMap =
      session.answers && typeof session.answers === 'object' && !Array.isArray(session.answers)
        ? session.answers as Record<string, unknown>
        : {};
    const normalized = normalizeStoredAnswers(rawAnswerMap);
    const hasUnrecognized = questionOrder.some(
      (qId) => rawAnswerMap[qId] != null && !normalized[qId]
    );
    const hasOrphaned = Object.keys(rawAnswerMap).some((qId) => !questionOrder.includes(qId));

    if (hasUnrecognized || hasOrphaned || Object.keys(normalized).length === 0) {
      return NextResponse.json(
        { error: 'This attempt has legacy or unmatched saved answers. It was not regraded to avoid changing the result from incomplete data.' },
        { status: 409 }
      );
    }

    const graded = await regradeSession(result.session_id);
    if (!graded) {
      return NextResponse.json({ error: 'Could not regrade this session.' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      score: graded.score,
      totalQuestions: graded.totalQuestions,
      percentage: graded.percentage,
      passed: graded.passed,
      created: graded.created,
    });
  } catch (err: any) {
    console.error('[/api/admin/results/[id]/regrade] error:', err);
    return NextResponse.json(
      { error: err?.message || 'Could not regrade this result.' },
      { status: 500 }
    );
  }
}
