import { supabaseAdmin } from '@/lib/supabase/admin';
import { verifyStudentSession } from '@/lib/auth/verify';
import { finalizeExpiredSessions } from '@/lib/db/grading';
import { redirect } from 'next/navigation';
import CourseStartButton from './course-start-button';

interface CourseWithStatus {
  id: string;
  course_code: string;
  title: string;
  duration_minutes: number;
  questions_per_test: number | null;
  is_active: boolean;
  show_result_to_student: boolean;
  show_review_to_student: boolean;
  max_attempts: number;
  pass_mark_percent: number;
  attempts_used: number;
  status: 'not_started' | 'in_progress' | 'completed';
  sessionId: string | null;
  score: number | null;
  percentage: number | null;
  passed: boolean | null;
  submit_type: string | null;
}

export default async function DashboardPage() {
  const student = await verifyStudentSession();
  if (!student) redirect('/login');

  try {
    await finalizeExpiredSessions();
  } catch {}

  const studentId = student.studentId;

  const { data: assignments } = await supabaseAdmin
    .from('course_assignments')
    .select(
      `
      *,
      courses (
        id, course_code, title, duration_minutes, questions_per_test,
        is_active, show_result_to_student, show_review_to_student,
        max_attempts, pass_mark_percent
      )
    `
    )
    .eq('student_id', studentId)
    .order('courses(course_code)');

  const coursesWithStatus: CourseWithStatus[] = [];

  for (const a of (assignments ?? [])) {
    const course = (a as any).courses;
    if (!course) continue;
    const maxAttempts = (a as any).attempts_override ?? course.max_attempts ?? 1;

    const { data: sessions } = await supabaseAdmin
      .from('test_sessions')
      .select('id, submitted_at, submit_type')
      .eq('student_id', studentId)
      .eq('course_id', course.id);

    const sessionList = (sessions ?? []) as Array<{
      id: string;
      submitted_at: string | null;
      submit_type: string | null;
    }>;

    const submitted = sessionList.filter(
      (s) => s.submitted_at && s.submit_type !== 'abandoned'
    );
    const inProgress = sessionList.find(
      (s) => !s.submitted_at && s.submit_type !== 'abandoned'
    );

    let status: CourseWithStatus['status'] = 'not_started';
    let score: number | null = null;
    let percentage: number | null = null;
    let passed: boolean | null = null;
    let submit_type: string | null = null;
    let sessionId: string | null = null;

    if (submitted.length > 0) {
      status = 'completed';
      const latest = [...submitted].sort(
        (x, y) => new Date(y.submitted_at ?? 0).getTime() - new Date(x.submitted_at ?? 0).getTime()
      )[0];
      sessionId = latest.id;
      submit_type = latest.submit_type;
      const { data: result } = await supabaseAdmin
        .from('test_results')
        .select('score, percentage, passed')
        .eq('session_id', latest.id)
        .maybeSingle();
      if (result) {
        score = result.score;
        percentage = Number(result.percentage);
        passed = result.passed;
      }
    } else if (inProgress) {
      status = 'in_progress';
      sessionId = inProgress.id;
    }

    coursesWithStatus.push({
      id: course.id,
      course_code: course.course_code,
      title: course.title,
      duration_minutes: course.duration_minutes,
      questions_per_test: course.questions_per_test,
      pass_mark_percent: course.pass_mark_percent ?? 50,
      is_active: course.is_active,
      show_result_to_student: course.show_result_to_student,
      show_review_to_student: course.show_review_to_student,
      max_attempts: maxAttempts,
      attempts_used: submitted.length,
      status,
      sessionId,
      score,
      percentage,
      passed,
      submit_type,
    });
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Courses</h1>
          <p className="text-slate-600">
            You can only see and take courses assigned to you by your admin.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/api/auth/student/logout"
            className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 text-sm hover:bg-slate-50"
          >
            Sign out
          </a>
        </div>
      </div>

      {coursesWithStatus.length === 0 && (
        <div className="bg-white p-8 rounded-lg border border-slate-200 text-center">
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            No courses assigned
          </h3>
          <p className="text-slate-600">Ask your admin to assign a course to you.</p>
        </div>
      )}

      <div className="grid gap-4">
        {coursesWithStatus.map((c) => (
          <div
            key={c.id}
            className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {c.course_code} — {c.title}
                </h3>
                <p className="text-sm text-slate-600 mb-1">
                  {c.duration_minutes} minutes{' '}
                  {c.questions_per_test ? `· up to ${c.questions_per_test} questions` : '· all questions'}
                </p>
              </div>
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${
                  c.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {c.is_active ? 'Open' : 'Closed'}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm text-slate-600 mb-4">
              <span>Attempts: {c.attempts_used} / {c.max_attempts}</span>
              <span className="ml-4">Pass mark: {c.pass_mark_percent}%</span>
            </div>

            <div className="space-y-2">
              {!c.is_active && (
                <p className="text-sm text-red-600 font-medium">
                  This test is currently closed by the admin.
                </p>
              )}
              {c.attempts_used >= c.max_attempts && c.status !== 'in_progress' && (
                <p className="text-sm text-red-600 font-medium">
                  Maximum attempts reached.
                </p>
              )}
              {(c.status === 'not_started' || c.status === 'in_progress') && c.is_active && c.attempts_used < c.max_attempts && (
                <CourseStartButton course={c} />
              )}
              {c.status === 'completed' && c.sessionId && c.show_result_to_student !== false && (
                <a
                  href={`/result/${c.sessionId}`}
                  className="w-full py-3 px-4 rounded-lg border border-slate-300 text-slate-700 font-semibold text-center hover:bg-slate-50 transition"
                >
                  View Result {c.percentage != null ? `— ${c.percentage}%` : ''}
                </a>
              )}
              {c.status === 'completed' && c.attempts_used < c.max_attempts && c.is_active && (
                <CourseStartButton
                  course={c}
                  label={`Retake Test — Attempt ${c.attempts_used + 1} of ${c.max_attempts}`}
                />
              )}
              {c.status === 'completed' && c.show_result_to_student === false && (
                <p className="text-sm text-slate-500">
                  Your test has been submitted successfully.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
