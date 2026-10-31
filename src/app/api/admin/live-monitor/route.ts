import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { finalizeExpiredSessions } from '@/lib/db/grading';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  // Auto-grade expired sessions so monitor reflects latest state.
  try {
    await finalizeExpiredSessions();
  } catch {}

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get('course_id');

  let query = supabaseAdmin
    .from('test_sessions')
    .select(
      `*, students(full_name, login_id), courses(course_code, title, max_pause_minutes, duration_minutes)`
    )
    .is('submitted_at', null)
    .order('started_at', { ascending: false });

  if (courseId) query = query.eq('course_id', courseId);

  const { data } = await query;
  const sessions = (data ?? []) as any[];

  const now = new Date().getTime();
  const monitor = sessions.map((s: any) => {
    const course = s.courses as any;
    const maxPauseSeconds = (course?.max_pause_minutes ?? 20) * 60;
    const pausedSeconds = s.paused_seconds ?? 0;
    const remainingAllowance = Math.max(0, maxPauseSeconds - pausedSeconds);
    const endsAt = new Date(s.ends_at).getTime();
    const effectiveEnd = endsAt + remainingAllowance * 1000;
    const lastHb = s.last_heartbeat_at ? new Date(s.last_heartbeat_at).getTime() : 0;
    const gapSeconds = lastHb > 0 ? (now - lastHb) / 1000 : 0;
    const isPaused = gapSeconds > 45; // disconnected
    const timeRemaining = isPaused
      ? Math.max(0, Math.floor((effectiveEnd - new Date(s.last_heartbeat_at ?? now).getTime()) / 1000))
      : Math.max(0, Math.floor((effectiveEnd - now) / 1000));

    const answers = (s.answers as Record<string, any> | null) ?? {};
    const answeredCount = Object.keys(answers).length;
    const total = (s.question_order as string[] | null)?.length ?? 0;

    return {
      sessionId: s.id,
      studentName: s.students?.full_name,
      loginId: s.students?.login_id,
      courseCode: s.courses?.course_code,
      courseTitle: s.courses?.title,
      status: isPaused ? 'paused' : 'online',
      pausedSince: s.last_heartbeat_at,
      timeRemaining,
      pausedSeconds: s.paused_seconds,
      disconnectCount: s.disconnect_count,
      answeredCount,
      totalQuestions: total,
      lastHeartbeatAt: s.last_heartbeat_at,
    };
  });

  const notStarted = 0; // would need assignments without sessions
  const submittedCount = sessions.filter((s) => s.submitted_at).length;

  return NextResponse.json({ sessions: monitor, summary: { inProgress: monitor.length } });
}
