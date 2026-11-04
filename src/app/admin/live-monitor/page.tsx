'use client';

import { useEffect, useState, useCallback } from 'react';

export default function LiveMonitorPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [abandonedCount, setAbandonedCount] = useState(0);
  const [filterCourse, setFilterCourse] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    const params = filterCourse ? `?course_id=${filterCourse}` : '';
    const res = await fetch(`/api/admin/live-monitor${params}`, { headers: { 'Cache-Control': 'no-store' } });
    if (!res.ok) return setError('Could not load monitor.');
    const json = await res.json();
    setSessions(json.sessions ?? []);
    setLastUpdated(new Date());
    // Fetch abandoned count from results API.
    try {
      const r = await fetch(`/api/admin/results?${params}`, { headers: { 'Cache-Control': 'no-store' } });
      const j = await r.json();
      setAbandonedCount(j.summary?.abandonedCount ?? 0);
    } catch {
      // ignore
    }
  }, [filterCourse]);

  useEffect(() => {
    fetch('/api/admin/courses', { headers: { 'Cache-Control': 'no-store' } })
      .then((r) => r.json())
      .then((json) => setCourses(json.courses ?? []));
    fetchData().then(() => setLoading(false));
  }, [fetchData]);

  // Auto-refresh every 10 seconds.
  useEffect(() => {
    const t = setInterval(fetchData, 10_000);
    return () => clearInterval(t);
  }, [fetchData]);

  const statusLabel = (s: any) => {
    if (s.status === 'paused') return { label: 'Paused', color: 'bg-amber-100 text-amber-700' };
    return { label: 'Online', color: 'bg-green-100 text-green-700' };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Live Monitor</h1>
        <div className="flex items-center gap-3">
          <select
            value={filterCourse}
            onChange={(e) => setFilterCourse(e.target.value)}
            className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
          >
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.course_code}</option>
            ))}
          </select>
          <span className="text-xs text-slate-500">
            Auto-refreshes every 10s · {lastUpdated?.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded text-sm text-red-700 bg-red-50 border border-red-100">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase">In progress</div>
          <div className="text-2xl font-bold text-slate-900">{sessions.length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase">Answered questions</div>
          <div className="text-2xl font-bold text-slate-900">
            {sessions.reduce((a, s) => a + (s.answeredCount ?? 0), 0)}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase">Paused (disconnected)</div>
          <div className="text-2xl font-bold text-slate-900">
            {sessions.filter((s) => s.status === 'paused').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase">Abandoned (inactive)</div>
          <div className="text-2xl font-bold text-amber-700">{abandonedCount}</div>
        </div>
      </div>

      {loading ? (
        <p className="text-center py-10">Loading monitor…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse border border-slate-200">
            <thead>
              <tr className="bg-slate-100 text-slate-600 text-xs sticky top-0">
                <th className="p-3 border border-slate-200">Student</th>
                <th className="p-3 border border-slate-200">Course</th>
                <th className="p-3 border border-slate-200 text-center">Status</th>
                <th className="p-3 border border-slate-200 text-center">Time remaining</th>
                <th className="p-3 border border-slate-200 text-center">Paused</th>
                <th className="p-3 border border-slate-200 text-center">Disconnects</th>
                <th className="p-3 border border-slate-200 text-center">Answered</th>
                <th className="p-3 border border-slate-200 text-center">Last heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const st = statusLabel(s);
                const mins = Math.floor(s.timeRemaining / 60);
                const secs = s.timeRemaining % 60;
                return (
                  <tr key={s.sessionId} className="bg-white">
                    <td className="p-3 border border-slate-200">{s.studentName}</td>
                    <td className="p-3 border border-slate-200 font-mono text-xs">{s.courseCode}</td>
                    <td className="p-3 border border-slate-200 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="p-3 border border-slate-200 text-center font-mono">
                      {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
                    </td>
                    <td className="p-3 border border-slate-200 text-center font-mono text-xs">
                      {Math.floor(s.pausedSeconds / 60)}m {s.pausedSeconds % 60}s
                    </td>
                    <td className="p-3 border border-slate-200 text-center font-mono text-xs">
                      {s.disconnectCount}
                    </td>
                    <td className="p-3 border border-slate-200 text-center">
                      {s.answeredCount} / {s.totalQuestions}
                    </td>
                    <td className="p-3 border border-slate-200 text-center text-xs text-slate-500">
                      {s.lastHeartbeatAt ? new Date(s.lastHeartbeatAt).toLocaleTimeString() : '—'}
                    </td>
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
