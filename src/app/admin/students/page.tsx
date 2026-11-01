'use client';

import { useEffect, useState, useCallback } from 'react';
import Modal from '@/components/Modal';

interface Student {
  id: string;
  full_name: string;
  login_id: string;
  is_active: boolean;
  created_at: string;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSingle, setShowSingle] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [credentials, setCredentials] = useState<Array<{ full_name: string; login_id: string; pin: string }>>([]);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/students', { headers: { 'Cache-Control': 'no-store' } });
    const json = await res.json();
    setStudents(json.students ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createStudent(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const full_name = formData.get('full_name') as string;
    const login_id = (formData.get('login_id') as string) || undefined;
    const pin = (formData.get('pin') as string) || undefined;
    const res = await fetch('/api/admin/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name, login_id, pin }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Create failed.');
      return;
    }
    const json = await res.json();
    setCredentials([{ full_name: json.student.full_name, login_id: json.student.login_id, pin: json.pin }]);
    setShowSingle(false);
    setShowBulk(true);
    load();
  }

  async function bulkCreate(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const names = formData.get('names') as string;
    const res = await fetch('/api/admin/students/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Bulk create failed.');
      return;
    }
    const json = await res.json();
    setCredentials(json.credentials);
    setShowBulk(true);
    load();
  }

  async function resetPin(id: string, name: string) {
    if (!window.confirm(`Reset PIN for ${name}? The new PIN will be shown once.`)) return;
    const res = await fetch(`/api/admin/students/${id}/reset-pin`, { method: 'POST' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Reset failed.');
      return;
    }
    const json = await res.json();
    setCredentials([{ full_name: json.student.full_name, login_id: json.student.login_id, pin: json.pin }]);
    setShowBulk(true);
  }

  async function toggleActive(id: string, current: boolean) {
    const res = await fetch(`/api/admin/students/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !current }),
    });
    if (res.ok) load();
  }

  async function delStudent(id: string) {
    if (!window.confirm('Delete this student? Their sessions/results will be removed.')) return;
    const res = await fetch(`/api/admin/students/${id}`, { method: 'DELETE' });
    if (res.ok) load();
  }

  function downloadCredentials() {
    const csv = [
      ['Name', 'Login ID', 'PIN'],
      ...credentials.map((c) => [c.full_name, c.login_id, c.pin]),
    ]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cbt-credentials.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Students</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowSingle(true); setShowBulk(false); }}
            className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            + Create One
          </button>
          <button
            onClick={() => { setShowBulk(true); setShowSingle(false); }}
            className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700"
          >
            + Bulk Create
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded text-sm text-red-700 bg-red-50 border border-red-100">{error}</div>
      )}

      {credentials.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-bold text-amber-800 mb-2">One-time credentials</h3>
          <p className="text-xs text-amber-700 mb-2">PINs are stored hashed. Copy them now — they won't be shown again.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse border border-amber-200">
              <thead>
                <tr className="bg-amber-100 text-amber-800 text-xs uppercase">
                  <th className="p-2 border border-amber-200">Name</th>
                  <th className="p-2 border border-amber-200">Login ID</th>
                  <th className="p-2 border border-amber-200">PIN</th>
                </tr>
              </thead>
              <tbody>
                {credentials.map((c) => (
                  <tr key={c.login_id} className="bg-white">
                    <td className="p-2 border border-amber-200">{c.full_name}</td>
                    <td className="p-2 border border-amber-200 font-mono">{c.login_id}</td>
                    <td className="p-2 border border-amber-200 font-mono font-bold">{c.pin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={downloadCredentials} className="px-3 py-1.5 rounded border border-amber-300 text-amber-800 text-xs hover:bg-amber-100">
              Download CSV
            </button>
            <button onClick={() => window.print()} className="px-3 py-1.5 rounded border border-amber-300 text-amber-800 text-xs hover:bg-amber-100">
              Print
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse border border-slate-200">
          <thead>
            <tr className="bg-slate-100 text-slate-600 text-xs uppercase">
              <th className="p-3 border border-slate-200">Name</th>
              <th className="p-3 border border-slate-200">Login ID</th>
              <th className="p-3 border border-slate-200">Status</th>
              <th className="p-3 border border-slate-200">Created</th>
              <th className="p-3 border border-slate-200">Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="bg-white">
                <td className="p-3 border border-slate-200">{s.full_name}</td>
                <td className="p-3 border border-slate-200 font-mono text-sm">{s.login_id}</td>
                <td className="p-3 border border-slate-200">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="p-3 border border-slate-200 text-sm">{new Date(s.created_at).toLocaleDateString()}</td>
                <td className="p-3 border border-slate-200">
                  <button onClick={() => toggleActive(s.id, s.is_active)} className="text-xs px-2 py-1 border border-slate-300 rounded text-slate-700 hover:bg-slate-100 mr-2">
                    {s.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                  <button onClick={() => resetPin(s.id, s.full_name)} className="text-xs px-2 py-1 border border-blue-200 rounded text-blue-600 hover:bg-blue-50 mr-2">
                    Reset PIN
                  </button>
                  <button onClick={() => delStudent(s.id)} className="text-xs px-2 py-1 border border-red-200 rounded text-red-600 hover:bg-red-50">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loading && <p>Loading students…</p>}

      <Modal open={showSingle} onClose={() => setShowSingle(false)} className="max-w-md">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Create Student</h2>
        <form onSubmit={createStudent} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Full name</label>
            <input required name="full_name" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Login ID (optional, auto-generated)</label>
            <input name="login_id" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="e.g. CSC/2023/001" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">PIN (optional, 6 digits auto-generated)</label>
            <input name="pin" type="text" maxLength={6} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={() => setShowSingle(false)} className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Create</button>
          </div>
        </form>
      </Modal>

      <Modal open={showBulk && credentials.length === 0} onClose={() => setShowBulk(false)} className="max-w-md">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Bulk Create Students</h2>
        <p className="text-sm text-slate-600 mb-4">Paste names, one per line. Optional: "Name, RegNumber" to use a custom login ID.</p>
        <form onSubmit={bulkCreate} className="space-y-3">
          <div>
            <textarea required name="names" rows={8} className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono" placeholder="Adebola Adebayo\nChinedu Okafor, CSC/2023/002\nFatima Yusuf" />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={() => setShowBulk(false)} className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700">Create All</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
