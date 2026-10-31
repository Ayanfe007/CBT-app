import { supabaseAdmin } from '@/lib/supabase/admin';
import { getSession } from './sessions';

export interface GradedResult {
  sessionId: string;
  studentId: string;
  courseId: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  passed: boolean;
  timeTakenSeconds: number;
  submitType: string;
  pausedSeconds: number;
  disconnectCount: number;
  answers: Record<string, { letter: string; seq: number }>;
  questionOrder: string[];
  optionOrders: Record<string, string[]>;
}

/**
 * Grade a session from its saved answers.
 * Compares each submitted original option letter against the question's
 * correct_option. time_taken_seconds excludes paused time.
 */
export async function gradeSession(sessionId: string): Promise<GradedResult | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const { data: course } = await supabaseAdmin
    .from('courses')
    .select('pass_mark_percent')
    .eq('id', session.course_id)
    .single();

  const passMark = course?.pass_mark_percent ?? 50;

  const { data: questions } = await supabaseAdmin
    .from('questions')
    .select('id, correct_option')
    .eq('course_id', session.course_id)
    .order('created_at');

  const questionIds = session.question_order as string[];
  const total = questionIds.length;
  const answers = (session.answers as Record<string, { letter: string; seq: number }>) ?? {};

  let score = 0;
  for (const qId of questionIds) {
    const q = (questions as any[] | null)?.find((x) => x.id === qId);
    const ans = answers[qId];
    if (q && ans && ans.letter === q.correct_option) score += 1;
  }

  const percentage = total > 0 ? Math.round((score / total) * 100 * 100) / 100 : 0;
  const passed = percentage >= passMark;

  let timeTakenSeconds = 0;
  if (session.started_at && session.ends_at) {
    const started = new Date(session.started_at).getTime();
    const ended = session.submitted_at
      ? new Date(session.submitted_at).getTime()
      : new Date(session.ends_at).getTime();
    let rawSeconds = Math.max(0, (ended - started) / 1000);
    rawSeconds -= session.paused_seconds ?? 0;
    timeTakenSeconds = Math.max(0, Math.floor(rawSeconds));
  }

  return {
    sessionId: session.id,
    studentId: session.student_id,
    courseId: session.course_id,
    score,
    totalQuestions: total,
    percentage,
    passed,
    timeTakenSeconds,
    submitType: session.submit_type ?? 'manual',
    pausedSeconds: session.paused_seconds ?? 0,
    disconnectCount: session.disconnect_count ?? 0,
    answers,
    questionOrder: questionIds,
    optionOrders: (session.option_orders as Record<string, string[]>) ?? {},
  };
}

/**
 * Find sessions that have expired and are not yet submitted, grade them,
 * and write test_results. Idempotent: test_results.session_id is unique so
 * re-running never creates duplicates.
 *
 * A session counts as expired when now > effectiveEnd, where
 * effectiveEnd = ends_at + remainingAllowanceSeconds and
 * remainingAllowanceSeconds = max_pause_minutes*60 - paused_seconds.
 * Equivalently: started_at + duration_minutes + max_pause_minutes.
 */
export async function finalizeExpiredSessions(): Promise<{
  expired: number;
  graded: number;
  results: GradedResult[];
}> {
  const now = new Date();

  // Fetch all in-progress sessions with their courses.
  const { data: sessions } = await supabaseAdmin
    .from('test_sessions')
    .select('*, courses(max_pause_minutes, duration_minutes, pass_mark_percent)')
    .is('submitted_at', null)
    .order('starts_at', { ascending: true });

  if (!sessions) return { expired: 0, graded: 0, results: [] };

  const expired: any[] = [];
  const results: GradedResult[] = [];

  for (const s of sessions as any[]) {
    const course = s.courses as any;
    const maxPauseSeconds = (course?.max_pause_minutes ?? 20) * 60;
    const pausedSeconds = s.paused_seconds ?? 0;
    const remainingAllowance = Math.max(0, maxPauseSeconds - pausedSeconds);
    const endsAt = new Date(s.ends_at).getTime();
    const effectiveEnd = endsAt + remainingAllowance * 1000;

    if (now.getTime() > effectiveEnd) {
      expired.push(s);
    }
  }

  for (const s of expired) {
    // Check if a result already exists (idempotency guard).
    const { data: existing } = await supabaseAdmin
      .from('test_results')
      .select('id')
      .eq('session_id', s.id)
      .maybeSingle();
    if (existing) continue;

    const graded = await gradeSession(s.id);
    if (!graded) continue;

    const submitType = 'auto_timeout';
    const submittedAt = new Date(s.ends_at).toISOString();

    // Mark session submitted.
    await supabaseAdmin
      .from('test_sessions')
      .update({ submitted_at: submittedAt, submit_type: submitType })
      .eq('id', s.id);

    // Write result.
    const { error } = await supabaseAdmin.from('test_results').insert({
      session_id: s.id,
      student_id: s.student_id,
      course_id: s.course_id,
      score: graded.score,
      total_questions: graded.totalQuestions,
      percentage: graded.percentage,
      passed: graded.passed,
      time_taken_seconds: graded.timeTakenSeconds,
      submit_type: submitType,
      paused_seconds: graded.pausedSeconds,
      disconnect_count: graded.disconnectCount,
    });

    if (!error) {
      results.push({
        ...graded,
        submitType,
      });
    }
  }

  return { expired: expired.length, graded: results.length, results };
}
