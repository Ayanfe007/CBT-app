'use client';

import { useEffect, useState, useCallback } from 'react';
import Modal from '@/components/Modal';
import { Toast } from '@/components/Toast';

interface Course { id: string; course_code: string; title: string; }
interface Question {
  id: string;
  course_id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
}

export default function QuestionsPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);
  const [showParser, setShowParser] = useState(false);
  const [parserText, setParserText] = useState('');
  const [parseValid, setParseValid] = useState<any[]>([]);
  const [parseErrors, setParseErrors] = useState<any[]>([]);
  const [parseDone, setParseDone] = useState(false);

  const loadCourses = useCallback(async () => {
    const res = await fetch('/api/admin/courses', { headers: { 'Cache-Control': 'no-store' } });
    const json = await res.json();
    setCourses(json.courses ?? []);
  }, []);

  const loadQuestions = useCallback(async () => {
    if (!selectedCourseId) return;
    const res = await fetch(`/api/admin/questions?course_id=${selectedCourseId}`, {
      headers: { 'Cache-Control': 'no-store' },
    });
    const json = await res.json();
    setQuestions(json.questions ?? []);
  }, [selectedCourseId]);

  useEffect(() => { loadCourses(); }, [loadCourses]);
  useEffect(() => { loadQuestions(); }, [loadQuestions]);

  async function deleteQuestion(id: string) {
    if (!window.confirm('Delete this question?')) return;
    const res = await fetch(`/api/admin/questions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadQuestions();
      showToast('success', 'Question deleted.');
    } else {
      showToast('error', 'Delete failed.');
    }
  }

  async function handleParse() {
    const res = await fetch('/api/admin/questions/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: parserText }),
    });
    const json = await res.json();
    setParseValid(json.valid ?? []);
    setParseErrors(json.errors ?? []);
    setParseDone(true);
  }

  async function handleSaveParsed() {
    if (!selectedCourseId) { setError('Select a course first.'); return; }
    for (const q of parseValid) {
      await fetch('/api/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: selectedCourseId,
          question_text: q.question_text,
          option_a: q.options.A,
          option_b: q.options.B,
          option_c: q.options.C,
          option_d: q.options.D,
          correct_option: q.correct_option,
        }),
      });
    }
    setParseDone(false);
    setParseValid([]);
    setParseErrors([]);
    setParserText('');
    setShowParser(false);
    loadQuestions();
    showToast('success', `Saved ${parseValid.length} question(s).`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Questions</h1>
        <button
          onClick={() => { setShowParser(true); setParseDone(false); }}
          className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          + Upload Questions (paste text)
        </button>
      </div>

      <Toast />
      {toast && (
        <div className={`p-3 rounded text-sm font-medium flex items-start gap-3 ${toast.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
          <span>{toast.type === 'success' ? '✓' : '✕'}</span>
          <span>{toast.message}</span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded text-sm text-red-700 bg-red-50 border border-red-100">{error}</div>
      )}

      <div className="flex gap-4">
        <div className="shrink-0">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Course</label>
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="w-64 border border-slate-300 rounded px-3 py-2 text-sm bg-white"
          >
            <option value="">Select a course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.course_code} — {c.title}</option>
            ))}
          </select>
        </div>
      </div>

      {!selectedCourseId && (
        <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 text-center">
          <p className="text-slate-600">Select a course to view and manage its questions.</p>
        </div>
      )}

      {selectedCourseId && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Questions ({questions.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-xs uppercase">
                  <th className="p-3 border border-slate-200">Question</th>
                  <th className="p-3 border border-slate-200">A</th>
                  <th className="p-3 border border-slate-200">B</th>
                  <th className="p-3 border border-slate-200">C</th>
                  <th className="p-3 border border-slate-200">D</th>
                  <th className="p-3 border border-slate-200">Correct</th>
                  <th className="p-3 border border-slate-200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id} className="bg-white">
                    <td className="p-3 border border-slate-200 text-sm">{q.question_text}</td>
                    <td className="p-3 border border-slate-200 text-sm">{q.option_a}</td>
                    <td className="p-3 border border-slate-200 text-sm">{q.option_b}</td>
                    <td className="p-3 border border-slate-200 text-sm">{q.option_c}</td>
                    <td className="p-3 border border-slate-200 text-sm">{q.option_d}</td>
                    <td className="p-3 border border-slate-200 text-sm font-mono">{q.correct_option}</td>
                    <td className="p-3 border border-slate-200">
                      <button
                        onClick={() => deleteQuestion(q.id)}
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
        </div>
      )}

      <Modal open={showParser} onClose={() => setShowParser(false)} className="max-w-2xl">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Upload Questions</h2>
        <p className="text-sm text-slate-600 mb-4">
          Paste questions in the supported format:<br />
          <span className="font-mono text-xs">1. What is a computer? a. Machine b. Animal c. Plant d. Rock [Ans: A]</span>
        </p>
        <textarea
          required
          rows={10}
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono mb-4"
          value={parserText}
          onChange={(e) => setParserText(e.target.value)}
        />
        <div className="flex gap-2 mb-4">
          <button
            onClick={handleParse}
            disabled={!parserText.trim()}
            className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Preview
          </button>
          <button
            onClick={() => setShowParser(false)}
            className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>

        {parseDone && (
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-green-800 mb-2">Valid ({parseValid.length})</h3>
                <div className="max-h-48 overflow-y-auto border border-green-200 rounded bg-green-50 p-2 text-sm">
                  {parseValid.map((q: any, i: number) => (
                    <div key={i} className="mb-2 border-b border-green-100 pb-2">
                      <div className="text-green-800 font-semibold">{q.question_text}</div>
                      <div className="text-xs text-slate-600">
                        A: {q.options.A} | B: {q.options.B} | C: {q.options.C} | D: {q.options.D} → Ans: {q.correct_option}
                      </div>
                    </div>
                  ))}
                  {parseValid.length === 0 && <span className="text-slate-400">None</span>}
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-800 mb-2">Errors ({parseErrors.length})</h3>
                <div className="max-h-48 overflow-y-auto border border-red-200 rounded bg-red-50 p-2 text-sm">
                  {parseErrors.map((e: any, i: number) => (
                    <div key={i} className="mb-2 border-b border-red-100 pb-2">
                      <div className="text-red-800 text-xs font-medium">{e.originalText}</div>
                      <div className="text-xs text-red-600 mt-1">{e.reason}</div>
                    </div>
                  ))}
                  {parseErrors.length === 0 && <span className="text-slate-400">None</span>}
                </div>
              </div>
            </div>
            {parseValid.length > 0 && selectedCourseId && (
              <button onClick={handleSaveParsed} className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700">
                Save {parseValid.length} Question(s)
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
