import { z } from 'zod';
import { NextResponse } from 'next/server';
import { verifyStudentSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createSession } from '@/lib/db/sessions';
import { shuffle } from '@/lib/shuffle';
import { finalizeExpiredSessions } from '@/lib/db/grading';
import { startTestSchema } from '@/lib/validators';

const schema = startTestSchema;

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

    try {
      await finalizeExpiredSessions();
    } catch {
      // best-effort
    }

    const { data: sessions } = await supabaseAdmin
      .from('test_sessions')
      .select('id, submitted_at, submit_type, question_order, ends_at')
      .eq('student_id', studentId)
      .eq('course_id', courseId);

    const completedCount = (sessions ?? []).filter(
      (s) => s.submitted_at && s.submit_type !== 'abandoned'
    ).length;
    if (completedCount >= maxAttempts) {
      return NextResponse.json(
        { error: 'Maximum attempts reached for this course.' },
        { status: 403 }
      );
    }

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

      const questionsOut = qIds.map((id) => {
        const q = qMap.get(id);
        if (!q) return null;
        return {
          id: q.id,
          question_text: q.question_text,
          options: {
            A: q.option_a ?? '',
            B: q.option_b ?? '',
            C: q.option_c ?? '',
            D: q.option_d ?? '',
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

    // Options always display in original order A-D. No option shuffling.
    const questionsOut: Array<{
      id: string;
      question_text: string;
      options: { A: string; B: string; C: string; D: string };
    }> = selected.map((q) => ({
      id: q.id,
      question_text: q.question_text,
      options: {
        A: q.option_a ?? '',
        B: q.option_b ?? '',
        C: q.option_c ?? '',
        D: q.option_d ?? '',
      },
    }));

    const qOutMap = new Map(questionsOut.map((q) => [q.id, q]));
    const finalQuestions = shuffledQuestionIds.map((id) => qOutMap.get(id)!).filter(Boolean);

    const now = new Date();
    const endsAt = new Date(now.getTime() + course.duration_minutes * 60 * 1000).toISOString();

    const sessionRow = await createSession({
      studentId,
      courseId,
      questionOrder: shuffledQuestionIds,
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
