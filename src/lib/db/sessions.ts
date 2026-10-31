import { supabaseAdmin } from '@/lib/supabase/admin';

export interface QuestionOption {
  A: string;
  B: string;
  C: string;
  D: string;
}

export interface TestSession {
  id: string;
  student_id: string;
  course_id: string;
  question_order: string[];
  option_orders: Record<string, string[]>; // question_id -> shuffled original letters
  answers: Record<string, { letter: string; seq: number }>;
  started_at: string | null;
  ends_at: string | null;
  submitted_at: string | null;
  submit_type: string | null;
  tab_switch_count: number;
  last_heartbeat_at: string | null;
  paused_seconds: number;
  disconnect_count: number;
  last_client_seq: number;
}

/**
 * Create a new test session. Caller (route handler) is responsible for
 * computing the shuffle and ends_at server-side.
 */
export async function createSession(input: {
  studentId: string;
  courseId: string;
  questionOrder: string[];
  optionOrders: Record<string, string[]>;
  endsAt: string;
}) {
  const { data, error } = await supabaseAdmin
    .from('test_sessions')
    .insert({
      student_id: input.studentId,
      course_id: input.courseId,
      question_order: input.questionOrder,
      option_orders: input.optionOrders,
      answers: {},
      started_at: new Date().toISOString(),
      ends_at: input.endsAt,
    })
    .select()
    .single();

  if (error) throw error;
  return data as TestSession;
}

/** Fetch a session by id (service-role, caller enforces ownership). */
export async function getSession(sessionId: string): Promise<TestSession | null> {
  const { data, error } = await supabaseAdmin
    .from('test_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as TestSession | null;
}

/**
 * Save answers idempotently using a client sequence number.
 * `answers` maps question_id -> { letter, seq }.
 * Only entries with seq > the stored seq for that question are applied.
 * last_client_seq is raised to the max seq seen.
 */
export async function saveAnswers(input: {
  sessionId: string;
  answers: Record<string, { letter: string; seq: number }>;
  clientSeq: number;
}) {
  const session = await getSession(input.sessionId);
  if (!session) throw new Error('Session not found');

  const existing: Record<string, { letter: string; seq: number }> =
    (session.answers as Record<string, { letter: string; seq: number }>) ?? {};

  let maxSeq = session.last_client_seq ?? 0;
  let changed = false;

  for (const [qId, entry] of Object.entries(input.answers)) {
    const cur = existing[qId];
    if (!cur || entry.seq > cur.seq) {
      existing[qId] = entry;
      changed = true;
    }
    if (entry.seq > maxSeq) maxSeq = entry.seq;
  }

  if (input.clientSeq > maxSeq) maxSeq = input.clientSeq;

  if (!changed && maxSeq === session.last_client_seq) {
    // Nothing new to persist.
    return { accepted: 0, lastClientSeq: session.last_client_seq };
  }

  const { error } = await supabaseAdmin
    .from('test_sessions')
    .update({
      answers: existing,
      last_client_seq: maxSeq,
    })
    .eq('id', input.sessionId);

  if (error) throw error;
  return { accepted: changed ? Object.keys(input.answers).length : 0, lastClientSeq: maxSeq };
}

/**
 * Heartbeat: update last_heartbeat_at, compute pause credit if there was a
 * gap, push ends_at forward within the course's max_pause_minutes allowance.
 * Returns { serverNow, endsAt, pausedSeconds, disconnectCount,
 *   remainingAllowanceSeconds, allowanceExhausted }.
 */
export async function heartbeat(input: {
  sessionId: string;
  clientSeq: number;
}): Promise<{
  serverNow: string;
  endsAt: string;
  pausedSeconds: number;
  disconnectCount: number;
  remainingAllowanceSeconds: number;
  allowanceExhausted: boolean;
}> {
  const session = await getSession(input.sessionId);
  if (!session) throw new Error('Session not found');

  // Fetch course for max_pause_minutes.
  const { data: course } = await supabaseAdmin
    .from('courses')
    .select('max_pause_minutes, duration_minutes')
    .eq('id', session.course_id)
    .single();

  const maxPauseMinutes = course?.max_pause_minutes ?? 20;
  const maxPauseSeconds = maxPauseMinutes * 60;

  const now = new Date();
  const serverNow = now.toISOString();
  let endsAt = new Date(session.ends_at ?? now).getTime();
  let pausedSeconds = session.paused_seconds ?? 0;
  let disconnectCount = session.disconnect_count ?? 0;
  let allowanceExhausted = false;

  const lastHb = session.last_heartbeat_at ? new Date(session.last_heartbeat_at).getTime() : null;

  if (lastHb !== null) {
    const gapMs = now.getTime() - lastHb;
    const gapSeconds = gapMs / 1000;

    if (gapSeconds > 45) {
      // Disconnect detected since last heartbeat.
      disconnectCount += 1;
      // Pause credit for this gap, subtract the expected 15s heartbeat interval.
      const pauseSeconds = Math.max(0, gapSeconds - 15);
      const remaining = maxPauseSeconds - pausedSeconds;
      const actualPause = Math.min(pauseSeconds, remaining);
      pausedSeconds += actualPause;
      endsAt += actualPause * 1000;
      if (actualPause < pauseSeconds) allowanceExhausted = true;
    }
  }

  const remainingAllowanceSeconds = Math.max(0, maxPauseSeconds - pausedSeconds);

  const { error } = await supabaseAdmin
    .from('test_sessions')
    .update({
      last_heartbeat_at: serverNow,
      paused_seconds: pausedSeconds,
      disconnect_count: disconnectCount,
      ends_at: new Date(endsAt).toISOString(),
    } as any)
    .eq('id', input.sessionId);

  if (error) throw error;

  return {
    serverNow,
    endsAt: new Date(endsAt).toISOString(),
    pausedSeconds,
    disconnectCount,
    remainingAllowanceSeconds,
    allowanceExhausted,
  };
}

/** Mark a session as manually submitted (client-side submit). */
export async function markSubmitted(input: {
  sessionId: string;
  submitType: 'manual' | 'admin_forced';
  submittedAt: string;
  answers: Record<string, string>; // question_id -> original letter
}) {
  const { error } = await supabaseAdmin
    .from('test_sessions')
    .update({
      submitted_at: input.submittedAt,
      submit_type: input.submitType,
      answers: Object.fromEntries(
        Object.entries(input.answers).map(([qId, letter]) => [qId, { letter, seq: 0 }])
      ),
    } as any)
    .eq('id', input.sessionId);

  if (error) throw error;
}

/** Admin: force-submit an in-progress session. */
export async function forceSubmit(sessionId: string) {
  return markSubmitted({
    sessionId,
    submitType: 'admin_forced',
    submittedAt: new Date().toISOString(),
    answers: {},
  });
}

/** Admin: extend a session's ends_at by N minutes. */
export async function extendTime(sessionId: string, minutes: number) {
  const session = await getSession(sessionId);
  if (!session) throw new Error('Session not found');
  const endsAt = new Date(session.ends_at ?? new Date()).getTime() + minutes * 60 * 1000;
  const { error } = await supabaseAdmin
    .from('test_sessions')
    .update({ ends_at: new Date(endsAt).toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
  return { endsAt: new Date(endsAt).toISOString() };
}

/** Admin: reset an attempt (delete session + result). */
export async function resetAttempt(sessionId: string) {
  // test_results has ON DELETE CASCADE via session_id unique? No — results
  // reference sessions. Delete result first, then session.
  await supabaseAdmin.from('test_results').delete().eq('session_id', sessionId);
  const { error } = await supabaseAdmin.from('test_sessions').delete().eq('id', sessionId);
  if (error) throw error;
}
