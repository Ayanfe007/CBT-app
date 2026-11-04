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
  option_orders: Record<string, string[]>;
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

export type SubmitType = 'manual' | 'auto_timeout' | 'admin_forced' | 'abandoned';

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

export async function getSession(sessionId: string): Promise<TestSession | null> {
  const { data, error } = await supabaseAdmin
    .from('test_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as TestSession | null;
}

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
    return { accepted: 0, lastClientSeq: session.last_client_seq };
  }

  const { error } = await supabaseAdmin
    .from('test_sessions')
    .update({
      answers: existing,
      last_client_seq: maxSeq,
      last_heartbeat_at: new Date().toISOString(),
    })
    .eq('id', input.sessionId);

  if (error) throw error;
  return { accepted: changed ? Object.keys(input.answers).length : 0, lastClientSeq: maxSeq };
}

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
      disconnectCount += 1;
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

export async function markSubmitted(input: {
  sessionId: string;
  submitType: SubmitType;
  submittedAt: string;
  answers: Record<string, string>;
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

export async function forceSubmit(sessionId: string) {
  return markSubmitted({
    sessionId,
    submitType: 'admin_forced',
    submittedAt: new Date().toISOString(),
    answers: {},
  });
}

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

export async function resetAttempt(sessionId: string) {
  await supabaseAdmin.from('test_results').delete().eq('session_id', sessionId);
  const { error } = await supabaseAdmin.from('test_sessions').delete().eq('id', sessionId);
  if (error) throw error;
}

export async function markAbandoned(sessionId: string) {
  const submittedAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('test_sessions')
    .update({ submitted_at: submittedAt, submit_type: 'abandoned' })
    .eq('id', sessionId);
  if (error) throw error;
  return { submittedAt, submitType: 'abandoned' };
}
