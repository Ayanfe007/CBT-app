import { supabaseAdmin } from '@/lib/supabase/admin';
import { verifyStudentSession } from '@/lib/auth/verify';
import { gradeSession } from '@/lib/db/grading';
import { redirect } from 'next/navigation';

interface ReviewItem {
  questionNumber: number;
  questionText: string;
  options: { A: string; B: string; C: string; D: string };
  studentAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
}

export default async function ResultPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const student = await verifyStudentSession();
  if (!student) redirect('/login');

  const { data: session, error: fetchErr } = await supabaseAdmin
    .from('test_sessions')
    .select('*, courses(*)')
    .eq('id', sessionId)
    .maybeSingle();

  if (fetchErr || !session) {
    redirect('/dashboard');
  }
  const s = session as any;
  if (s.student_id !== student.studentId) {
    redirect('/dashboard');
  }

  const course = s.courses as any;
  const showResult = course.show_result_to_student !== false;
  const showReview = course.show_review_to_student !== false;

  if (!s.submitted_at) {
    redirect(`/test/${sessionId}`);
  }

  let { data: result, error: resultErr } = await supabaseAdmin
    .from('test_results')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (!result) {
    try {
      const regraded = await gradeSession(sessionId, 'manual');
      if (regraded) {
        result = {
          id: '',
          session_id: sessionId,
          student_id: regraded.studentId,
          course_id: regraded.courseId,
          score: regraded.score,
          total_questions: regraded.totalQuestions,
          percentage: regraded.percentage,
          passed: regraded.passed,
          time_taken_seconds: regraded.timeTakenSeconds,
          submit_type: regraded.submitType,
          paused_seconds: regraded.pausedSeconds,
          disconnect_count: regraded.disconnectCount,
          graded_at: new Date().toISOString(),
        };
      }
    } catch (err: any) {
      resultErr = err;
    }
  }

  if (resultErr) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          Could not load result
        </h2>
        <p className="text-slate-600 mb-4">{resultErr?.message || 'Unknown error'}</p>
        <button
          onClick={() => {
            window.location.reload();
          }}
          className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  let review: ReviewItem[] | null = null;
  if (showReview) {
    const { data: questions } = await supabaseAdmin
      .from('questions')
      .select('id, question_text, option_a, option_b, option_c, option_d, correct_option')
      .eq('course_id', s.course_id)
      .order('created_at');

    const questionOrder = (s.question_order as string[]) ?? [];
    const answers = (s.answers as Record<string, { letter: string }> | null) ?? {};
    const qMap = new Map((questions as any[] | null)?.map((q) => [q.id, q]) ?? []);

    review = questionOrder.map((qId: string, idx: number) => {
      const q = qMap.get(qId);
      if (!q) return null;
      const studentAnswer = answers[qId]?.letter ?? null;
      const correctAnswer = q.correct_option;
      return {
        questionNumber: idx + 1,
        questionText: q.question_text,
        options: {
          A: q.option_a,
          B: q.option_b,
          C: q.option_c,
          D: q.option_d,
        },
        studentAnswer,
        correctAnswer,
        isCorrect: studentAnswer === correctAnswer,
      };
    }).filter(Boolean) as ReviewItem[];
  }

  const percentage = result ? Number(result.percentage) : 0;
  const passed = result ? result.passed : false;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <nav className="mb-6">
        <a
          href="/dashboard"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to dashboard
        </a>
      </nav>

      {!showResult && (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-3">
            Your test has been submitted successfully.
          </h2>
          <p className="text-slate-600">
            Your result has been recorded. Thank you for taking the test.
          </p>
        </div>
      )}

      {showResult && (
        <div className="bg-white rounded-lg border border-slate-200 p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Test Result</h2>
              <p className="text-slate-600">
                {course.course_code} — {course.title}
              </p>
            </div>
            <div className="text-right">
              <div className={`text-3xl font-bold ${
                passed ? 'text-green-700' : 'text-red-700'
              }`}>
                {percentage.toFixed(2)}%
              </div>
              <div className="text-sm text-slate-500">{passed ? 'Passed' : 'Not passed'}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-600 mb-6">
            <div className="p-3 rounded bg-slate-50 border border-slate-200">
              <div className="text-xs font-semibold text-slate-500 uppercase">Score</div>
              <div className="text-lg font-bold">
                {result.score} / {result.total_questions}
              </div>
            </div>
            <div className="p-3 rounded bg-slate-50 border border-slate-200">
              <div className="text-xs font-semibold text-slate-500 uppercase">Submit type</div>
              <div className="text-lg font-bold capitalize">
                {result.submit_type?.replace('_', ' ')}
              </div>
            </div>
            <div className="p-3 rounded bg-slate-50 border border-slate-200">
              <div className="text-xs font-semibold text-slate-500 uppercase">Time taken</div>
              <div className="text-lg font-bold">
                {result.time_taken_seconds != null
                  ? `${Math.floor(result.time_taken_seconds / 60)}m ${result.time_taken_seconds % 60}s`
                  : '—'}
              </div>
            </div>
            {result.paused_seconds != null && result.paused_seconds > 0 && (
              <div className="p-3 rounded bg-slate-50 border border-slate-200">
                <div className="text-xs font-semibold text-slate-500 uppercase">Paused time</div>
                <div className="text-lg font-bold">
                  {Math.floor(result.paused_seconds / 60)}m {result.paused_seconds % 60}s
                </div>
              </div>
            )}
            {result.disconnect_count != null && result.disconnect_count > 0 && (
              <div className="p-3 rounded bg-slate-50 border border-slate-200">
                <div className="text-xs font-semibold text-slate-500 uppercase">Disconnects</div>
                <div className="text-lg font-bold">{result.disconnect_count}</div>
              </div>
            )}
          </div>

          {showReview && review && (
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-4">
                Question-by-question review
              </h3>
              <div className="space-y-4">
                {review.map((item) => (
                  <div
                    key={item.questionNumber}
                    className="border border-slate-200 rounded-lg p-4 bg-white"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-semibold text-slate-700">
                        Q{item.questionNumber}
                      </span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded ${
                          item.isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {item.isCorrect ? 'Correct' : 'Incorrect'}
                      </span>
                    </div>
                    <div className="text-slate-800 mb-3">{item.questionText}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                        const isStudent = item.studentAnswer === letter;
                        const isCorrect = item.correctAnswer === letter;
                        return (
                          <div
                            key={letter}
                            className={`p-2 rounded text-left border ${
                              isCorrect
                                ? 'bg-green-50 border-green-200 text-green-800'
                                : isStudent
                                ? 'bg-red-50 border-red-200 text-red-800'
                                : 'bg-slate-50 border-slate-200 text-slate-700'
                            }`}
                          >
                            <span className="font-mono font-bold mr-1">{letter}</span>{' '}
                            {item.options[letter]}
                            {isCorrect && <span className="ml-2 text-green-600 text-xs">✓</span>}
                            {isStudent && !isCorrect && (
                              <span className="ml-2 text-red-600 text-xs">your answer</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
