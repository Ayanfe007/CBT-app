import { z } from 'zod';
import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { finalizeExpiredSessions } from '@/lib/db/grading';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  // Auto-grade expired sessions before reporting.
  try {
    await finalizeExpiredSessions();
  } catch {}

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get('course_id');
  const studentId = searchParams.get('student_id');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const search = searchParams.get('search');

  // Graded results (have test_results rows).
  let query = supabaseAdmin
    .from('test_results')
    .select(
      `*, students(full_name, login_id), courses(course_code, title), test_sessions(submit_type, tab_switch_count)`
    )
    .order('graded_at', { ascending: false });

  if (courseId) query = query.eq('course_id', courseId);
  if (studentId) query = query.eq('student_id', studentId);
  if (from) query = query.gte('graded_at', from);
  if (to) query = query.lte('graded_at', to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let results = (data ?? []) as any[];

  // Abandoned sessions (no test_results row) — fetch separately and merge.
  let abandonQuery = supabaseAdmin
    .from('test_sessions')
    .select(
      `id, student_id, course_id, submitted_at, submit_type, paused_seconds, disconnect_count, students(full_name, login_id), courses(course_code, title)`
    )
    .eq('submit_type', 'abandoned')
    .order('submitted_at', { ascending: false });

  if (courseId) abandonQuery = abandonQuery.eq('course_id', courseId);
  if (studentId) abandonQuery = abandonQuery.eq('student_id', studentId);
  if (from) abandonQuery = abandonQuery.gte('submitted_at', from);
  if (to) abandonQuery = abandonQuery.lte('submitted_at', to);

  const { data: abandonedData } = await abandonQuery;
  const abandoned = (abandonedData ?? []).map((s: any) => ({
    id: s.id,
    student_id: s.student_id,
    course_id: s.course_id,
    score: null,
    total_questions: 0,
    percentage: 0,
    passed: false,
    time_taken_seconds: null,
    submit_type: s.submit_type,
    paused_seconds: s.paused_seconds ?? 0,
    disconnect_count: s.disconnect_count ?? 0,
    graded_at: s.submitted_at,
    students: s.students,
    courses: s.courses,
    test_sessions: { submit_type: s.submit_type, tab_switch_count: 0 },
    _abandoned: true,
  }));

  results = [...results, ...abandoned];

  if (search) {
    const term = search.toLowerCase();
    results = results.filter(
      (r) =>
        r.students?.full_name?.toLowerCase().includes(term) ||
        r.students?.login_id?.toLowerCase().includes(term) ||
        r.courses?.course_code?.toLowerCase().includes(term)
    );
  }

  // Summary only counts graded results (not abandoned).
  const gradedResults = results.filter((r) => !r._abandoned);
  const summary = {
    average:
      gradedResults.length > 0
        ? (gradedResults.reduce((a, r) => a + Number(r.percentage), 0) / gradedResults.length).toFixed(2)
        : 0,
    highest:
      gradedResults.length > 0
        ? Math.max(...gradedResults.map((r) => Number(r.percentage))).toFixed(2)
        : 0,
    lowest:
      gradedResults.length > 0
        ? Math.min(...gradedResults.map((r) => Number(r.percentage))).toFixed(2)
        : 0,
    passRate:
      gradedResults.length > 0
        ? ((gradedResults.filter((r) => r.passed).length / gradedResults.length) * 100).toFixed(2)
        : 0,
    count: gradedResults.length,
    abandonedCount: results.filter((r) => r._abandoned).length,
  };

  return NextResponse.json({ results, summary });
}
