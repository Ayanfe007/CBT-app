import { supabaseAdmin } from '@/lib/supabase/admin';
import { getSession } from './sessions';
import { getAnswerLetter, normalizeStoredAnswers } from '@/lib/answers';

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
  created: boolean; // true if a new test_results row was inserted, false if updated existing
}

/**
 * Pure: minutes of inactivity for a session.
 * reference = last_heartbeat_at ?? started_at ?? now.
 */
export function computeInactiveMinutes(
  session: { last_heartbeat_at: string | null; started_at: string | null },
  nowMs: number,
): number {
  const lastHb = session.last_heartbeat_at
    ? new Date(session.last_heartbeat_at).getTime()
    : null;
  const startedAt = session.started_at
    ? new Date(session.started_at).getTime()
    : null;
  const referenceMs = lastHb ?? startedAt ?? nowMs;
  return Math.max(0, (nowMs - referenceMs) / 60000);
}

/**
 * Pure: should a session be abandoned given inactivity and course threshold?
 */
export function shouldAbandon(
  session: { last_heartbeat_at: string | null; started_at: string | null },
  abandonAfterMinutes: number,
  nowMs: number,
): boolean {
  if (abandonAfterMinutes <= 0) return false;
  return computeInactiveMinutes(session, nowMs) > abandonAfterMinutes;
}

/**
 * Grade a session from its saved answers.
 * Single plain comparison: answers[questionId] === question.correct_option.
 * No letter-to-position mapping or translation exists anywhere.
 *
 * @param sessionId   The session to grade.
 * @param submitType  The submit type to record ('manual', 'auto_timeout', 'admin_forced').
 * @param payloadAnswers  Optional answers from the client submit payload ({ questionId: letter }),
 *                        merged with saved answers (payload takes precedence).
 */
export async function gradeSession(
  sessionId: string,
  submitType: string = 'manual',
  payloadAnswers?: Record<string, string>,
): Promise<GradedResult | null> {
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

  // Merge saved answers with payload answers (payload takes precedence).
  // Normalize older flat-letter values so a saved 'A' is not treated as missing.
  const answers = normalizeStoredAnswers(session.answers);
  if (payloadAnswers) {
    for (const [qId, rawLetter] of Object.entries(payloadAnswers)) {
      const letter = getAnswerLetter(rawLetter);
      if (letter) answers[qId] = { letter, seq: 0 };
    }
  }

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
    submitType: session.submit_type ?? submitType,
    pausedSeconds: session.paused_seconds ?? 0,
    disconnectCount: session.disconnect_count ?? 0,
    answers,
    questionOrder: questionIds,
    created: false,
  };
}

/**
 * Grade a session and atomically persist the result:
 * 1. Upsert test_results (idempotent on session_id).
 * 2. Mark the session submitted only after the result row is saved.
 *
 * This is the single function used by manual submit, auto-timeout,
 * admin force-submit, and finalizeExpiredSessions.
 */
export async function regradeSession(
  sessionId: string,
  submitType?: string,
): Promise<GradedResult | null> {
  const session = await getSession(sessionId);
  if (!session) return null;
  if (!session.submitted_at) {
    throw new Error('Session is not submitted');
  }

  const st = submitType ?? session.submit_type ?? 'manual';
  const graded = await gradeSession(sessionId, st);
  if (!graded) return null;

  // Check if a result already existed BEFORE upserting (for created/fixed tracking).
  const { data: existingBefore } = await supabaseAdmin
    .from('test_results')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();

  // Upsert test_results (idempotent on session_id unique constraint).
  const { error: resultErr } = await supabaseAdmin
    .from('test_results')
    .upsert(
      {
        session_id: session.id,
        student_id: session.student_id,
        course_id: session.course_id,
        score: graded.score,
        total_questions: graded.totalQuestions,
        percentage: graded.percentage,
        passed: graded.passed,
        time_taken_seconds: graded.timeTakenSeconds,
        submit_type: graded.submitType,
        paused_seconds: graded.pausedSeconds,
        disconnect_count: graded.disconnectCount,
      },
      { onConflict: 'session_id' },
    );

  if (resultErr) throw resultErr;

  // Mark session submitted only after result is saved.
  if (!session.submitted_at) {
    const { error: sessionErr } = await supabaseAdmin
      .from('test_sessions')
      .update({ submitted_at: new Date().toISOString(), submit_type: graded.submitType })
      .eq('id', session.id);

    if (sessionErr) throw sessionErr;
  }

  const wasCreated = !existingBefore;

  return { ...graded, created: wasCreated };
}

/**
 * Regrade every submitted session that is missing a test_results row.
 * Returns counts: created (new rows), fixed (updated existing), unchanged (skipped).
 */
export async function regradeAllResults(): Promise<{
  created: number;
  fixed: number;
  unchanged: number;
  results: GradedResult[];
}> {
  const { data: sessions } = await supabaseAdmin
    .from('test_sessions')
    .select('id, submitted_at')
    .not('submitted_at', 'is', null)
    .order('submitted_at', { ascending: false });

  if (!sessions) return { created: 0, fixed: 0, unchanged: 0, results: [] };

  let createdCount = 0;
  let fixedCount = 0;
  let unchangedCount = 0;
  const results: GradedResult[] = [];

  for (const s of sessions as any[]) {
    // Check if a result already exists.
    const { data: existing } = await supabaseAdmin
      .from('test_results')
      .select('id')
      .eq('session_id', s.id)
      .maybeSingle();

    try {
      const graded = await regradeSession(s.id);
      if (!graded) {
        unchangedCount += 1;
        continue;
      }
      if (existing) {
        fixedCount += 1;
      } else {
        createdCount += 1;
      }
      results.push(graded);
    } catch {
      unchangedCount += 1;
    }
  }

  return { created: createdCount, fixed: fixedCount, unchanged: unchangedCount, results };
}

/**
 * Shared abandon check used by finalizeExpiredSessions, the dashboard,
 * the start route, the session-load route and the admin monitor.
 */
export async function checkAndFinalizeAbandoned(session: any): Promise<boolean> {
  const course = await supabaseAdmin
    .from('courses')
    .select('abandon_after_minutes')
    .eq('id', session.course_id)
    .maybeSingle();

  const abandonAfterMinutes = (course.data as any)?.abandon_after_minutes ?? 60;
  if (abandonAfterMinutes <= 0) return false; // 0 disables

  const now = new Date();
  const lastHb = session.last_heartbeat_at
    ? new Date(session.last_heartbeat_at).getTime()
    : null;
  const startedAt = session.started_at
    ? new Date(session.started_at).getTime()
    : null;
  const referenceMs = lastHb ?? startedAt ?? now.getTime();

  const inactiveMinutes = (now.getTime() - referenceMs) / 60000;
  if (inactiveMinutes > abandonAfterMinutes) {
    const submittedAt = now.toISOString();
    await supabaseAdmin
      .from('test_sessions')
      .update({
        submitted_at: submittedAt,
        submit_type: 'abandoned',
      })
      .eq('id', session.id);
    return true;
  }
  return false;
}

/**
 * Find sessions that have expired or been abandoned and are not yet submitted.
 * For each session, the abandon rule is checked FIRST (before normal expiry).
 * If abandoned: mark submit_type = 'abandoned', submitted_at = now, NO result row.
 * If expired (not abandoned): grade and write test_results via upsert. Idempotent.
 */
export async function finalizeExpiredSessions(): Promise<{
  expired: number;
  abandoned: number;
  graded: number;
  results: GradedResult[];
}> {
  const now = new Date();

  // Fetch all in-progress sessions with their courses.
  const { data: sessions } = await supabaseAdmin
    .from('test_sessions')
    .select('*, courses(max_pause_minutes, duration_minutes, pass_mark_percent, abandon_after_minutes)')
    .is('submitted_at', null)
    .order('starts_at', { ascending: true });

  if (!sessions) return { expired: 0, abandoned: 0, graded: 0, results: [] };

  let abandonedCount = 0;
  let expiredCount = 0;
  const results: GradedResult[] = [];

  for (const s of sessions as any[]) {
    const course = s.courses as any;

    // 1. Abandon rule checked FIRST.
    const abandonAfterMinutes = course?.abandon_after_minutes ?? 60;
    if (abandonAfterMinutes > 0) {
      const lastHb = s.last_heartbeat_at
        ? new Date(s.last_heartbeat_at).getTime()
        : null;
      const startedAt = s.started_at
        ? new Date(s.started_at).getTime()
        : null;
      const referenceMs = lastHb ?? startedAt ?? now.getTime();
      const inactiveMinutes = (now.getTime() - referenceMs) / 60000;

      if (inactiveMinutes > abandonAfterMinutes) {
        const submittedAt = now.toISOString();
        await supabaseAdmin
          .from('test_sessions')
          .update({ submitted_at: submittedAt, submit_type: 'abandoned' })
          .eq('id', s.id);
        abandonedCount += 1;
        continue; // skip normal expiry grading for abandoned sessions
      }
    }

    // 2. Normal expiry check.
    const maxPauseSeconds = (course?.max_pause_minutes ?? 20) * 60;
    const pausedSeconds = s.paused_seconds ?? 0;
    const remainingAllowance = Math.max(0, maxPauseSeconds - pausedSeconds);
    const endsAt = new Date(s.ends_at).getTime();
    const effectiveEnd = endsAt + remainingAllowance * 1000;

    if (now.getTime() <= effectiveEnd) continue; // not expired yet

    expiredCount += 1;

    const graded = await gradeSession(s.id, 'auto_timeout');
    if (!graded) continue;

    const submitType = 'auto_timeout';
    const submittedAt = new Date(s.ends_at).toISOString();

    // Upsert result first (idempotent).
    const { error: resultErr } = await supabaseAdmin
      .from('test_results')
      .upsert(
        {
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
        },
        { onConflict: 'session_id' },
      );

    if (resultErr) {
      console.error('[finalizeExpiredSessions] result insert failed:', resultErr);
      continue; // don't mark session submitted if result failed
    }

    // Mark session submitted only after result is saved.
    await supabaseAdmin
      .from('test_sessions')
      .update({ submitted_at: submittedAt, submit_type: submitType })
      .eq('id', s.id);

    results.push({ ...graded, submitType });
  }

  return { expired: expiredCount, abandoned: abandonedCount, graded: results.length, results };
}
