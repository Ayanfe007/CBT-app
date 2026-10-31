'use client';

import { useEffect, useState, useCallback } from 'react';

interface Student { id: string; full_name: string; login_id: string; is_active: boolean }
interface Course { id: string; course_code: string; title: string }
interface Assignment { student_id: string; course_id: string }

export default function AssignmentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [sRes, cRes, aRes] = await Promise.all([
      fetch('/api/admin/students', { headers: { 'Cache-Control': 'no-store' } }),
      fetch('/api/admin/courses', { headers: { 'Cache-Control': 'no-store' } }),
      fetch('/api/admin/assignments', { headers: { 'Cache-Control': 'no-store' } }),
    ]);
    const [sJson, cJson, aJson] = await Promise.all([sRes.json(), cRes.json(), aRes.json()]);
    setStudents(sJson.students ?? []);
    setCourses(cJson.courses ?? []);
    setAssignments(aJson.assignments ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const assigned = new Set(assignments.map((a) => `${a.student_id}:${a.course_id}`));

  async function toggle(studentId: string, courseId: string, currentlyAssigned: boolean) {
    if (currentlyAssigned) {
      const res = await fetch(`/api/admin/assignments?student_id=${studentId}&course_id=${courseId}`, {
        method: 'DELETE',
      });
      if (!res.ok) return setError('Unassign failed.');
      assigned.delete(`${studentId}:${courseId}`);
    } else {
      const res = await fetch('/api/admin/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: [studentId], courseId }),
      });
      if (!res.ok) return setError('Assign failed.');
      assigned.add(`${studentId}:${courseId}`);
    }
    setError('');
  }

  async function bulkAssign(courseId: string) {
    const selected = students.filter((s) => s.is_active).map((s) => s.id);
    if (selected.length === 0) return;
    const res = await fetch('/api/admin/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds: selected, courseId }),
    });
    if (!res.ok) return setError('Bulk assign failed.');
    selected.forEach((sid) => assigned.add(`${sid}:${courseId}`));
    setError('');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Assign Courses to Students</h1>
      </div>

      {error && (
        <div className="p-3 rounded text-sm text-red-700 bg-red-50 border border-red-100">{error}</div>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Bulk assign</h3>
            <p className="text-xs text-slate-500 mb-2">Assign all active students to a course:</p>
            <div className="flex gap-2 flex-wrap">
              {courses.map((c) => (
                <button
                  key={c.id}
                  onClick={() => bulkAssign(c.id)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-sm text-slate-700 hover:bg-slate-100"
                >
                  Assign all to {c.course_code}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-xs sticky top-0">
                  <th className="p-3 border border-slate-200">Student</th>
                  <th className="p-3 border border-slate-200">Login ID</th>
                  {courses.map((c) => (
                    <th key={c.id} className="p-3 border border-slate-200 text-center">
                      <span className="font-mono text-xs">{c.course_code}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="bg-white">
                    <td className="p-3 border border-slate-200">{s.full_name}</td>
                    <td className="p-3 border border-slate-200 font-mono text-xs">{s.login_id}</td>
                    {courses.map((c) => (
                      <td key={c.id} className="p-3 border border-slate-200 text-center">
                        <button
                          onClick={() => toggle(s.id, c.id, assigned.has(`${s.id}:${c.id}`))}
                          className={`w-6 h-6 rounded ${
                            assigned.has(`${s.id}:${c.id}`)
                              ? 'bg-blue-600 border-blue-600'
                              : 'bg-white border-slate-300 hover:bg-slate-100'
                          }`}
                          aria-label={assigned.has(`${s.id}:${c.id}`) ? 'Unassign' : 'Assign'}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
