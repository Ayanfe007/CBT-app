'use client';

import { useEffect, useState, useCallback } from 'react';

export default function ResultsPage() {
  const [results, setResults] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [courses, setCourses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [regrading, setRegrading] = useState(false);
  const [regradeMsg, setRegradeMsg] = useState('');

  const [filterCourse, setFilterCourse] = useState('');
  const [filterStudent, setFilterStudent] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterCourse) params.set('course_id', filterCourse);
    if (filterStudent) params.set('student_id', filterStudent);
    if (filterFrom) params.set('from', filterFrom);
    if (filterTo) params.set('to', filterTo);
    if (search) params.set('search', search);
    const res = await fetch(`/api/admin/results?${params}`, { headers: { 'Cache-Control': 'no-store' } });
    const json = await res.json();
    setResults(json.results ?? []);
    setSummary(json.summary ?? {});
  }, [filterCourse, filterStudent, filterFrom, filterTo, search]);

  const handleRegrade = useCallback(async () => {
    setRegrading(true);
    setRegradeMsg('');
    try {
      const res = await fetch('/api/admin/results/regrade', {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        setRegradeMsg(json.error || 'Regrade failed.');
        return;
      }
      setRegradeMsg(
        `Regrade complete: ${json.created} created, ${json.fixed} fixed, ${json.unchanged} unchanged.`
      );
      await fetchData();
    } catch (err: any) {
      setRegradeMsg(err.message || 'Regrade failed.');
    } finally {
      setRegrading(false);
    }
  }, [fetchData]);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/courses', { headers: { 'Cache-Control': 'no-store' } }).then((r) => r.json()),
      fetch('/api/admin/students', { headers: { 'Cache-Control': 'no-store' } }).then((r) => r.json()),
    ]).then(([cJson, sJson]) => {
      setCourses(cJson.courses ?? []);
      setStudents(sJson.students ?? []);
    });
    fetchData().then(() => setLoading(false));
  }, [fetchData]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const csvUrl = () => {
    const params = new URLSearchParams();
    if (filterCourse) params.set('course_id', filterCourse);
    if (filterStudent) params.set('student_id', filterStudent);
    if (filterFrom) params.set('from', filterFrom);
    if (filterTo) params.set('to', filterTo);
    return `/api/admin/results/csv?${params}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Results & Live Monitor</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRegrade}
            disabled={regrading}
            className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 text-sm hover:bg-slate-100 disabled:opacity-60"
          >
            {regrading ? 'Regrading…' : 'Regrade All Results'}
          </button>
          <a
            href={csvUrl()}
            className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 text-sm hover:bg-slate-100"
          >
            Export CSV
          </a>
        </div>
      </div>

      {regradeMsg && (
        <div className={`p-3 rounded text-sm border ${
          regradeMsg.startsWith('Regrade complete')
            ? 'bg-green-50 text-green-700 border-green-100'
            : 'bg-red-50 text-red-700 border-red-100'
        }`}>
          {regradeMsg}
        </div>
      )}

      {error && (
        <div className="p-3 rounded text-sm text-red-700 bg-red-50 border border-red-100">{error}</div>
      )}

      {error && (
        <div className="p-3 rounded text-sm text-red-700 bg-red-50 border border-red-100">{error}</div>
      )}

      {/* Filters */}
      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Course</label>
            <select
              value={filterCourse}
              onChange={(e) => setFilterCourse(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white"
            >
              <option value="">All</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.course_code}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Student</label>
            <select
              value={filterStudent}
              onChange={(e) => setFilterStudent(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white"
            >
              <option value="">All</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">From</label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">To</label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search by name or login ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 border border-slate-300 rounded px-3 py-2 text-sm bg-white"
          />
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {[
          { label: 'Submitted', value: String(summary.count ?? 0) },
          { label: 'Average', value: String(summary.average ?? 0) + '%' },
          { label: 'Highest', value: String(summary.highest ?? 0) + '%' },
          { label: 'Lowest', value: String(summary.lowest ?? 0) + '%' },
          { label: 'Pass rate', value: String(summary.passRate ?? 0) + '%' },
          { label: 'Abandoned', value: String(summary.abandonedCount ?? 0) },
        ].map((item) => (
          <div key={item.label} className="bg-white p-4 rounded-lg border border-slate-200">
            <div className="text-xs font-semibold text-slate-500 uppercase">{item.label}</div>
            <div className="text-2xl font-bold text-slate-900">{item.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-center py-10">Loading results…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse border border-slate-200">
            <thead>
              <tr className="bg-slate-100 text-slate-600 text-xs sticky top-0">
                <th className="p-3 border border-slate-200">Student</th>
                <th className="p-3 border border-slate-200">Course</th>
                <th className="p-3 border border-slate-200 text-right">Score</th>
                <th className="p-3 border border-slate-200 text-right">%</th>
                <th className="p-3 border border-slate-200 text-center">Pass</th>
                <th className="p-3 border border-slate-200">Submit type</th>
                <th className="p-3 border border-slate-200">Time taken</th>
                <th className="p-3 border border-slate-200 text-center">Paused</th>
                <th className="p-3 border border-slate-200 text-center">Disconnects</th>
                <th className="p-3 border border-slate-200 text-center">Tab switches</th>
                <th className="p-3 border border-slate-200">Graded at</th>
                <th className="p-3 border border-slate-200">Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const sess = r.test_sessions as any;
                return (
                  <tr key={r.id} className="bg-white">
                    <td className="p-3 border border-slate-200">{r.students?.full_name}</td>
                    <td className="p-3 border border-slate-200 font-mono text-xs">{r.courses?.course_code}</td>
                    {r._abandoned ? (
                      <>
                        <td className="p-3 border border-slate-200 text-right text-slate-400">— / —</td>
                        <td className="p-3 border border-slate-200 text-right font-mono text-slate-400">—%</td>
                        <td className="p-3 border border-slate-200 text-center">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                            —
                          </span>
                        </td>
                        <td className="p-3 border border-slate-200 text-sm">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                            Abandoned
                          </span>
                        </td>
                        <td className="p-3 border border-slate-200 text-sm font-mono text-slate-400">—</td>
                        <td className="p-3 border border-slate-200 text-center font-mono text-xs">{sess?.paused_seconds ?? '—'}</td>
                        <td className="p-3 border border-slate-200 text-center font-mono text-xs">{sess?.disconnect_count ?? '—'}</td>
                        <td className="p-3 border border-slate-200 text-center font-mono text-xs">—</td>
                        <td className="p-3 border border-slate-200 text-sm">{new Date(r.graded_at).toLocaleString()}</td>
                        <td className="p-3 border border-slate-200">
                          <span className="text-xs text-slate-400">—</span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-3 border border-slate-200 text-right">{r.score} / {r.total_questions}</td>
                        <td className="p-3 border border-slate-200 text-right font-mono">{Number(r.percentage).toFixed(2)}%</td>
                        <td className="p-3 border border-slate-200 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${r.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                          >
                            {r.passed ? 'Pass' : 'Fail'}
                          </span>
                        </td>
                        <td className="p-3 border border-slate-200 text-sm capitalize">{r.submit_type?.replace('_', ' ')}</td>
                        <td className="p-3 border border-slate-200 text-sm font-mono">
                          {r.time_taken_seconds != null ? `${Math.floor(r.time_taken_seconds / 60)}m ${r.time_taken_seconds % 60}s` : '—'}
                        </td>
                        <td className="p-3 border border-slate-200 text-center font-mono text-xs">{sess?.paused_seconds ?? '—'}</td>
                        <td className="p-3 border border-slate-200 text-center font-mono text-xs">{sess?.disconnect_count ?? '—'}</td>
                        <td className="p-3 border border-slate-200 text-center font-mono text-xs">{sess?.tab_switch_count ?? '—'}</td>
                        <td className="p-3 border border-slate-200 text-sm">{new Date(r.graded_at).toLocaleString()}</td>
                        <td className="p-3 border border-slate-200">
                          <a href={`/admin/results/${r.id}/breakdown`} className="text-xs text-blue-600 hover:underline">
                            Breakdown
                          </a>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
