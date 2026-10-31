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

  if (search) {
    const term = search.toLowerCase();
    results = results.filter(
      (r) =>
        r.students?.full_name?.toLowerCase().includes(term) ||
        r.students?.login_id?.toLowerCase().includes(term) ||
        r.courses?.course_code?.toLowerCase().includes(term)
    );
  }

  const summary = {
    average:
      results.length > 0
        ? (results.reduce((a, r) => a + Number(r.percentage), 0) / results.length).toFixed(2)
        : 0,
    highest:
      results.length > 0
        ? Math.max(...results.map((r) => Number(r.percentage))).toFixed(2)
        : 0,
    lowest:
      results.length > 0
        ? Math.min(...results.map((r) => Number(r.percentage))).toFixed(2)
        : 0,
    passRate:
      results.length > 0
        ? ((results.filter((r) => r.passed).length / results.length) * 100).toFixed(2)
        : 0,
    count: results.length,
  };

  return NextResponse.json({ results, summary });
}
