'use client';

import { useEffect, useState, useCallback } from 'react';
import Modal from '@/components/Modal';

interface Course {
  id: string;
  course_code: string;
  title: string;
  duration_minutes: number;
  questions_per_test: number | null;
  pass_mark_percent: number;
  max_attempts: number;
  max_pause_minutes: number;
  is_active: boolean;
  show_result_to_student: boolean;
  show_review_to_student: boolean;
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState<{
    course_code: string;
    title: string;
    duration_minutes: string;
    questions_per_test: string;
    pass_mark_percent: string;
    max_attempts: string;
    is_active: boolean;
    show_result_to_student: boolean;
    show_review_to_student: boolean;
    max_pause_minutes: string;
  }>({
    course_code: '',
    title: '',
    duration_minutes: '30',
    questions_per_test: '',
    pass_mark_percent: '50',
    max_attempts: '1',
    is_active: true,
    show_result_to_student: true,
    show_review_to_student: true,
    max_pause_minutes: '20',
  });

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/courses', { headers: { 'Cache-Control': 'no-store' } });
    const json = await res.json();
    setCourses(json.courses ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveCourse(e: React.FormEvent) {
    e.preventDefault();
    const body: any = {
      ...form,
      duration_minutes: Number(form.duration_minutes),
      pass_mark_percent: Number(form.pass_mark_percent),
      max_attempts: Number(form.max_attempts),
      max_pause_minutes: Number(form.max_pause_minutes),
      questions_per_test:
        form.questions_per_test === '' ? null : Number(form.questions_per_test),
    };
    const url = editing ? `/api/admin/courses/${editing.id}` : '/api/admin/courses';
    const method = editing ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Save failed.');
      return;
    }
    setOpenForm(false);
    setEditing(null);
    setError('');
    load();
  }

  async function deleteCourse(id: string) {
    if (!window.confirm('Delete this course and all its questions/results?')) return;
    const res = await fetch(`/api/admin/courses/${id}`, { method: 'DELETE' });
    if (res.ok) load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Courses</h1>
        <button
          onClick={() => {
            setEditing(null);
            setForm({
              course_code: '', title: '', duration_minutes: '30', questions_per_test: '',
              pass_mark_percent: '50', max_attempts: '1', is_active: true,
              show_result_to_student: true, show_review_to_student: true, max_pause_minutes: '20',
            });
            setOpenForm(true);
          }}
          className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          + Add Course
        </button>
      </div>

      {error && (
        <div className="p-3 rounded text-sm text-red-700 bg-red-50 border border-red-100">{error}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse border border-slate-200">
          <thead>
            <tr className="bg-slate-100 text-slate-600 text-xs uppercase">
              <th className="p-3 border border-slate-200">Code</th>
              <th className="p-3 border border-slate-200">Title</th>
              <th className="p-3 border border-slate-200">Duration</th>
              <th className="p-3 border border-slate-200">Questions</th>
              <th className="p-3 border border-slate-200">Pass Mark</th>
              <th className="p-3 border border-slate-200">Max Attempts</th>
              <th className="p-3 border border-slate-200">Max Pause (min)</th>
              <th className="p-3 border border-slate-200">Status</th>
              <th className="p-3 border border-slate-200">Actions</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} className="bg-white">
                <td className="p-3 border border-slate-200 font-mono text-sm">{c.course_code}</td>
                <td className="p-3 border border-slate-200">{c.title}</td>
                <td className="p-3 border border-slate-200">{c.duration_minutes} min</td>
                <td className="p-3 border border-slate-200">{c.questions_per_test == null ? 'All' : c.questions_per_test}</td>
                <td className="p-3 border border-slate-200">{c.pass_mark_percent}%</td>
                <td className="p-3 border border-slate-200">{c.max_attempts}</td>
                <td className="p-3 border border-slate-200">{c.max_pause_minutes}</td>
                <td className="p-3 border border-slate-200">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {c.is_active ? 'Open' : 'Closed'}
                  </span>
                </td>
                <td className="p-3 border border-slate-200">
                  <button
                    onClick={() => {
                      setEditing(c);
                      setForm({
                        course_code: c.course_code, title: c.title,
                        duration_minutes: String(c.duration_minutes),
                        questions_per_test: c.questions_per_test == null ? '' : String(c.questions_per_test),
                        pass_mark_percent: String(c.pass_mark_percent), max_attempts: String(c.max_attempts),
                        is_active: c.is_active, show_result_to_student: c.show_result_to_student,
                        show_review_to_student: c.show_review_to_student,
                        max_pause_minutes: String(c.max_pause_minutes),
                      });
                      setOpenForm(true);
                    }}
                    className="text-xs px-2 py-1 border border-slate-300 rounded text-slate-700 hover:bg-slate-100"
                  >
                    Edit
                  </button>
                  {' '}
                  <button
                    onClick={() => deleteCourse(c.id)}
                    className="text-xs px-2 py-1 border border-red-200 rounded text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loading && <p>Loading courses…</p>}

      <Modal open={openForm} onClose={() => setOpenForm(false)} className="max-w-md">
        <h2 className="text-lg font-bold text-slate-900 mb-4">{editing ? 'Edit Course' : 'Add Course'}</h2>
        <form onSubmit={saveCourse} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Course code</label>
            <input
              required
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              value={form.course_code}
              onChange={(e) => setForm({ ...form, course_code: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Title</label>
            <input
              required
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Duration (minutes)</label>
            <input
              required
              type="number"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Questions per test (blank = all)</label>
            <input
              type="number"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              value={form.questions_per_test}
              onChange={(e) => setForm({ ...form, questions_per_test: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Pass mark (%)</label>
            <input
              type="number"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              value={form.pass_mark_percent}
              onChange={(e) => setForm({ ...form, pass_mark_percent: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Max attempts</label>
            <input
              type="number"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              value={form.max_attempts}
              onChange={(e) => setForm({ ...form, max_attempts: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Max pause allowance (minutes)</label>
            <input
              type="number"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              value={form.max_pause_minutes}
              onChange={(e) => setForm({ ...form, max_pause_minutes: e.target.value })}
            />
            <p className="text-xs text-slate-500 mt-1">0 disables pausing. Timer pauses when connection is lost.</p>
          </div>
          <div className="flex items-start gap-3 mt-2">
            <input
              id="is_active"
              type="checkbox"
              className="mt-0.5"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <label htmlFor="is_active" className="text-sm text-slate-700">Course is open (students can start)</label>
          </div>
          <div className="flex items-start gap-3">
            <input
              id="show_result"
              type="checkbox"
              className="mt-0.5"
              checked={form.show_result_to_student}
              onChange={(e) => setForm({ ...form, show_result_to_student: e.target.checked })}
            />
            <label htmlFor="show_result" className="text-sm text-slate-700">Show score to student</label>
          </div>
          <div className="flex items-start gap-3">
            <input
              id="show_review"
              type="checkbox"
              className="mt-0.5"
              checked={form.show_review_to_student}
              onChange={(e) => setForm({ ...form, show_review_to_student: e.target.checked })}
            />
            <label htmlFor="show_review" className="text-sm text-slate-700">Show review to student</label>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => setOpenForm(false)}
              className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">
              {editing ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
