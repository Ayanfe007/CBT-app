'use client';

import { useEffect, useState } from 'react';

type OptionLetter = 'A' | 'B' | 'C' | 'D';

interface BreakdownItem {
  questionNumber: number;
  questionText: string;
  studentAnswer: OptionLetter | null;
  correctAnswer: OptionLetter | null;
  answerStatus: 'correct' | 'incorrect' | 'unanswered' | 'unrecognized';
  isCorrect: boolean;
  options?: Partial<Record<OptionLetter, string>> | null;
}

export default function BreakdownPage({ params }: { params: Promise<{ id: string }> }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [regrading, setRegrading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { id } = await params;
        const res = await fetch(`/api/admin/results/${id}/breakdown`, {
          headers: { 'Cache-Control': 'no-store' },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || 'Could not load breakdown.');
        }
        if (!Array.isArray(json.breakdown)) {
          throw new Error('The breakdown response is incomplete. Please retry.');
        }
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Could not load breakdown.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params]);

  async function handleRegrade() {
    if (regrading) return;
    setRegrading(true);
    setActionMessage('');
    try {
      const { id } = await params;
      const res = await fetch(`/api/admin/results/${id}/regrade`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Regrade failed.');

      setActionMessage(
        `Saved-answer regrade complete: ${json.score}/${json.totalQuestions} (${Number(json.percentage).toFixed(2)}%).`
      );

      const refreshed = await fetch(`/api/admin/results/${id}/breakdown`, {
        headers: { 'Cache-Control': 'no-store' },
      });
      const refreshedJson = await refreshed.json().catch(() => ({}));
      if (refreshed.ok && Array.isArray(refreshedJson.breakdown)) {
        setData(refreshedJson);
      }
    } catch (err: any) {
      setActionMessage(err?.message || 'Regrade failed.');
    } finally {
      setRegrading(false);
    }
  }

  if (loading) return <div className="p-6">Loading breakdown…</div>;
  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-red-600 mb-4">{error}</p>
        <a href="/admin/results" className="text-sm text-blue-600 hover:underline">
          ← Back to results
        </a>
      </div>
    );
  }
  if (!data?.result || !Array.isArray(data.breakdown)) {
    return <div className="p-6">Breakdown not found.</div>;
  }

  const r = data.result;
  const breakdown = data.breakdown as BreakdownItem[];
  const answerSummary = data.answerSummary ?? {
    total: breakdown.length,
    answered: breakdown.filter((item) => item.answerStatus === 'correct' || item.answerStatus === 'incorrect').length,
    unanswered: breakdown.filter((item) => item.answerStatus === 'unanswered').length,
    unrecognized: breakdown.filter((item) => item.answerStatus === 'unrecognized').length,
    orphaned: 0,
  };
  const canRegrade =
    answerSummary.answered > 0 && answerSummary.unrecognized === 0 && answerSummary.orphaned === 0;
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Review: {r.courses?.course_code}</h1>
          <p className="text-slate-600">
            {r.students?.full_name} ({r.students?.login_id}) ·{' '}
            {r.score} / {r.total_questions} ·{' '}
            {Number(r.percentage).toFixed(2)}% ·{' '}
            {r.passed ? 'Passed' : 'Not passed'} ·{' '}
            {r.submit_type?.replace('_', ' ')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={handleRegrade}
            disabled={regrading || !canRegrade}
            className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            title={!canRegrade ? 'This result has no safely recognized A-D answer map to regrade.' : 'Recompute only this result from its saved answers.'}
          >
            {regrading ? 'Regrading…' : 'Regrade this result'}
          </button>
          <a href="/admin/results" className="text-sm text-blue-600 hover:underline">← Back to results</a>
        </div>
      </div>

      {actionMessage && (
        <p className={`mb-4 rounded border p-3 text-sm ${
          actionMessage.includes('complete')
            ? 'border-green-200 bg-green-50 text-green-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {actionMessage}
        </p>
      )}

      <div className={`mb-5 rounded-lg border p-3 text-sm ${
        !canRegrade
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-slate-200 bg-slate-50 text-slate-700'
      }`}>
        Recognized A–D answers: <strong>{answerSummary.answered} / {answerSummary.total}</strong>
        {answerSummary.unanswered > 0 && <> · {answerSummary.unanswered} unanswered</>}
        {answerSummary.unrecognized > 0 && <> · {answerSummary.unrecognized} saved in an older/unrecognized format</>}
        {answerSummary.orphaned > 0 && <> · {answerSummary.orphaned} saved answer(s) do not match this attempt&apos;s questions</>}
        {answerSummary.unrecognized > 0 && (
          <div className="mt-1">This attempt contains legacy response values. The current letter-based grader will not alter this result; an administrator must verify it using the original attempt data.</div>
        )}
        {answerSummary.answered === 0 && answerSummary.unrecognized === 0 && (
          <div className="mt-1">No recognizable answers are linked to this attempt. A regrade cannot recover choices that were never saved.</div>
        )}
      </div>

      {breakdown.length === 0 ? (
        <p className="text-slate-600">No question breakdown is available for this result.</p>
      ) : (
        <div className="space-y-4">
          {breakdown.map((item, i) => (
            <div key={`${item.questionNumber}-${i}`} className="border border-slate-200 rounded-lg p-4 bg-white">
              <div className="flex justify-between items-start mb-2">
                <span className="font-semibold text-slate-700">Q{item.questionNumber}</span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                    item.answerStatus === 'unanswered' || item.answerStatus === 'unrecognized'
                      ? 'bg-amber-100 text-amber-700'
                      : item.isCorrect
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                  }`}
                >
                  {item.answerStatus === 'unrecognized'
                    ? 'Legacy answer'
                    : item.answerStatus === 'unanswered'
                      ? 'Unanswered'
                      : item.isCorrect
                        ? 'Correct'
                        : 'Incorrect'}
                </span>
              </div>
              <div className="text-slate-800 mb-3">{item.questionText}</div>
              {item.answerStatus === 'unrecognized' && (
                <p className="text-xs text-amber-700 mb-3">
                  A saved response exists, but its legacy format cannot be safely matched to A–D.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                  const isStudent = item.studentAnswer === letter;
                  const isCorrect = item.correctAnswer === letter;
                  const optionText = item.options?.[letter] ?? '(option unavailable)';
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
                      <span className="font-mono font-bold mr-1">{letter}</span>
                      {optionText}
                      {isCorrect && <span className="ml-2 text-green-600 text-xs">✓ correct</span>}
                      {isStudent && (
                        <span className={`ml-2 text-xs ${isCorrect ? 'text-green-700' : 'text-red-600'}`}>
                          student answer
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
