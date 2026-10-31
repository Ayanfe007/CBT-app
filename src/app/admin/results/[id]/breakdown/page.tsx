'use client';

import { useEffect, useState } from 'react';

export default function BreakdownPage({ params }: { params: Promise<{ id: string }> }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { id } = await params;
      const res = await fetch(`/api/admin/results/${id}/breakdown`, { headers: { 'Cache-Control': 'no-store' } });
      if (!res.ok) {
        setError('Could not load breakdown.');
        setLoading(false);
        return;
      }
      const json = await res.json();
      setData(json);
      setLoading(false);
    })();
  }, [params]);

  if (loading) return <div className="p-6">Loading breakdown…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!data) return <div className="p-6">Not found.</div>;

  const r = data.result;
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
        <a href="/admin/results" className="text-sm text-blue-600 hover:underline">← Back to results</a>
      </div>

      <div className="space-y-4">
        {data.breakdown.map((item: any, i: number) => (
          <div key={i} className="border border-slate-200 rounded-lg p-4 bg-white">
            <div className="flex justify-between items-start mb-2">
              <span className="font-semibold text-slate-700">Q{item.questionNumber}</span>
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
              {(['A', 'B', 'C', 'D'] as const).map((pos) => {
                const origLetter = item.displayLabels[pos] as 'A' | 'B' | 'C' | 'D';
                const isStudent = item.studentAnswer === origLetter;
                const isCorrect = item.correctAnswer === origLetter;
                return (
                  <div
                    key={pos}
                    className={`p-2 rounded text-left border ${
                      isCorrect
                        ? 'bg-green-50 border-green-200 text-green-800'
                        : isStudent
                        ? 'bg-red-50 border-red-200 text-red-800'
                        : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <span className="font-mono font-bold mr-1">{pos}</span>
                    {item.options[origLetter]}
                    {isCorrect && <span className="ml-2 text-green-600 text-xs">✓ correct</span>}
                    {isStudent && !isCorrect && <span className="ml-2 text-red-600 text-xs">student answer</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
