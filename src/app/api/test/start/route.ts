import { z } from 'zod';
import { NextResponse } from 'next/server';
import { verifyStudentSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createSession } from '@/lib/db/sessions';
import { shuffle, shuffleOptions } from '@/lib/shuffle';
import { finalizeExpiredSessions } from '@/lib/db/grading';
import { startTestSchema } from '@/lib/validators';

const schema = startTestSchema;

function isPinnedOption(text: string): boolean {
  const t = text.toLowerCase().trim();
  return (
    t.includes('all of the above') ||
    t.includes('none of the above') ||
    t.includes('all of these') ||
    t.includes('none of these') ||
    /^both\s+a\s*(and|&)\s+b/.test(t) ||
    /^both\s+a\s*(and|&)\s+b\s+and\s+c/.test(t)
  );
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await verifyStudentSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      console.error('[/api/test/start] validation failed. Received keys:', Object.keys(body ?? {}), parsed.error.issues);
      return NextResponse.json(
        { error: 'Invalid request.', field: parsed.error.issues[0]?.path.join('.') ?? 'courseId', reason: parsed.error.issues[0]?.message ?? 'Invalid courseId' },
        { status: 400 }
      );
    }

    const studentId = session.studentId;
    const { courseId } = parsed.data;

    const { data: course, error: courseErr } = await supabaseAdmin
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .maybeSingle();
    if (courseErr || !course) {
      return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
    }
    if (!course.is_active) {
      return NextResponse.json({ error: 'This test is currently closed.' }, { status: 403 });
    }

    const { data: assignment } = await supabaseAdmin
      .from('course_assignments')
      .select('*, attempts_override')
      .eq('student_id', studentId)
      .eq('course_id', courseId)
      .maybeSingle();
    if (!assignment) {
      return NextResponse.json({ error: 'You are not assigned to this course.' }, { status: 403 });
    }

    const maxAttempts = assignment.attempts_override ?? course.max_attempts;

    // Finalize any expired/abandoned sessions before counting attempts.
    try {
      await finalizeExpiredSessions();
    } catch {
      // best-effort
    }

    const { data: sessions } = await supabaseAdmin
      .from('test_sessions')
      .select('id, submitted_at, submit_type, question_order, option_orders, ends_at')
      .eq('student_id', studentId)
      .eq('course_id', courseId);

    // Completed attempts exclude abandoned sessions (they don't consume an attempt).
    const completedCount = (sessions ?? []).filter(
      (s) => s.submitted_at && s.submit_type !== 'abandoned'
    ).length;
    if (completedCount >= maxAttempts) {
      return NextResponse.json(
        { error: 'Maximum attempts reached for this course.' },
        { status: 403 }
      );
    }

    // Resume an in-progress (non-abandoned, unsubmitted) session.
    const inProgress = (sessions ?? []).find(
      (s) => !s.submitted_at && s.submit_type !== 'abandoned'
    );
    if (inProgress) {
      const { data: questions } = await supabaseAdmin
        .from('questions')
        .select('id, question_text, option_a, option_b, option_c, option_d')
        .eq('course_id', courseId);

      const qIds = (inProgress.question_order as string[]) ?? [];
      const qMap = new Map((questions ?? []).map((q) => [q.id, q]));

      const optionOrders = (inProgress.option_orders as Record<string, string[]>) ?? {};
      const questionsOut = qIds.map((id) => {
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
        };
      }).filter(Boolean);

      return NextResponse.json({
        sessionId: inProgress.id,
        endsAt: inProgress.ends_at,
        resumed: true,
        questions: questionsOut,
      });
    }

    const { data: questions } = await supabaseAdmin
      .from('questions')
      .select('id, question_text, option_a, option_b, option_c, option_d, correct_option')
      .eq('course_id', courseId);

    if (!questions || questions.length === 0) {
      return NextResponse.json({ error: 'This course has no questions yet.' }, { status: 400 });
    }

    let selected = [...questions];
    if (course.questions_per_test && course.questions_per_test < selected.length) {
      selected = shuffle(selected).slice(0, course.questions_per_test);
    }

    const questionIds = selected.map((q) => q.id);
    const shuffledQuestionIds = shuffle(questionIds);

    const optionOrders: Record<string, string[]> = {};
    const questionsOut: Array<{
      id: string;
      question_text: string;
      options: { A: string; B: string; C: string; D: string };
    }> = [];

    for (const q of selected) {
      const originals = ['A', 'B', 'C', 'D'] as const;
      const pinned = new Set<string>();
      originals.forEach((l) => {
        const text = (q as Record<string, string>)[`option_${l.toLowerCase()}`];
        if (text && isPinnedOption(text)) pinned.add(l);
      });

      const { displayOrder } = shuffleOptions(
        { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
        pinned
      );
      optionOrders[q.id] = displayOrder;

      const displayOptions: { A: string; B: string; C: string; D: string } = {
        A: '', B: '', C: '', D: '',
      };
      displayOrder.forEach((origLetter, pos) => {
        const key = ['A', 'B', 'C', 'D'][pos] as 'A' | 'B' | 'C' | 'D';
        const src = `option_${origLetter.toLowerCase()}`;
        displayOptions[key] = (q as Record<string, string>)[src];
      });

      questionsOut.push({
        id: q.id,
        question_text: q.question_text,
        options: displayOptions,
      });
    }

    const qOutMap = new Map(questionsOut.map((q) => [q.id, q]));
    const finalQuestions = shuffledQuestionIds.map((id) => qOutMap.get(id)!).filter(Boolean);

    const now = new Date();
    const endsAt = new Date(now.getTime() + course.duration_minutes * 60 * 1000).toISOString();

    const sessionRow = await createSession({
      studentId,
      courseId,
      questionOrder: shuffledQuestionIds,
      optionOrders,
      endsAt,
    });

    return NextResponse.json({
      sessionId: sessionRow.id,
      endsAt,
      resumed: false,
      questions: finalQuestions,
    });
  } catch (err: any) {
    console.error('[/api/test/start] error:', err);
    return NextResponse.json(
      { error: err.message || 'Could not start test.' },
      { status: 500 }
    );
  }
}
