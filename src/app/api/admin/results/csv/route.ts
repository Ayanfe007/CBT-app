import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { finalizeExpiredSessions } from '@/lib/db/grading';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  try {
    await finalizeExpiredSessions();
  } catch {}

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get('course_id');
  const studentId = searchParams.get('student_id');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  let query = supabaseAdmin
    .from('test_results')
    .select(
      `*, students(full_name, login_id), courses(course_code, title), test_sessions(submit_type, tab_switch_count, paused_seconds, disconnect_count)`
    )
    .order('graded_at', { ascending: false });

  if (courseId) query = query.eq('course_id', courseId);
  if (studentId) query = query.eq('student_id', studentId);
  if (from) query = query.gte('graded_at', from);
  if (to) query = query.lte('graded_at', to);

  const { data } = await query;
  const rows = (data ?? []) as any[];

  const header = [
    'Student Name',
    'Login ID',
    'Course Code',
    'Course Title',
    'Score',
    'Total Questions',
    'Percentage',
    'Passed',
    'Submit Type',
    'Time Taken (seconds)',
    'Paused Time (seconds)',
    'Disconnect Count',
    'Tab Switches',
    'Graded At',
  ];

  const escapeCsv = (v: unknown) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [header.join(',')];
  for (const r of rows) {
    const sess = r.test_sessions as any;
    lines.push([
      escapeCsv(r.students?.full_name),
      escapeCsv(r.students?.login_id),
      escapeCsv(r.courses?.course_code),
      escapeCsv(r.courses?.title),
      r.score,
      r.total_questions,
      r.percentage,
      r.passed ? 'Yes' : 'No',
      r.submit_type,
      r.time_taken_seconds,
      sess?.paused_seconds ?? '',
      sess?.disconnect_count ?? '',
      sess?.tab_switch_count ?? '',
      r.graded_at,
    ].join(','));
  }

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename=cbt-results.csv',
    },
  });
}
