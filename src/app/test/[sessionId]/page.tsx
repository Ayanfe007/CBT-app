'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  savePendingAnswer,
  getPendingAnswers,
  removePendingAnswer,
  clearPendingAnswers,
  cacheSession,
  getCachedSession,
  removeCachedSession,
  type PendingAnswer,
  type SessionCache,
} from '@/lib/idb';

type OptionLetter = 'A' | 'B' | 'C' | 'D';

interface Question {
  id: string;
  question_text: string;
  options: Record<OptionLetter, string>;
}

interface StartResponse {
  sessionId: string;
  endsAt: string;
  resumed: boolean;
  questions: Question[];
}

interface SessionResponse {
  sessionId: string;
  endsAt: string;
  questions: Question[];
  questionOrder: string[];
  optionOrders: Record<string, string[]>;
  submittedAt: string | null;
  answers: Record<string, { letter: string; seq: number }>;
}

const HEARTBEAT_MS = 15_000;
const AUTOSAVE_DEBOUNCE_MS = 2_000;
const REQUEST_TIMEOUT_MS = 15_000;

export default function TestPage() {
  const { sessionId: rawSessionId } = useParams();
  const sessionId = typeof rawSessionId === 'string' ? rawSessionId : rawSessionId?.[0] ?? '';
  const searchParams = useSearchParams();
  const router = useRouter();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' && navigator.onLine);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedMinutesUsed, setPausedMinutesUsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [submitError, setSubmitError] = useState('');

  const serverEndsAtRef = useRef<string>('');
  const offsetRef = useRef(0); // server_now - local_now at last sync
  const lastSyncLocalRef = useRef(0);
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingDirty = false;
  let seq = 0;

  // ---- Sync pending answers from IndexedDB into local state ----
  useEffect(() => {
    if (!sessionId || sessionId === 'new') return;
    getPendingAnswers(sessionId).then((pending) => {
      const byQuestion: Record<string, string> = {};
      pending.forEach((p) => {
        // Keep the highest seq per question.
        const cur = byQuestion[p.questionId];
        if (!cur || p.seq > (pending.find((x) => x.questionId === p.questionId)?.seq ?? 0)) {
          byQuestion[p.questionId] = p.letter;
        }
      });
      setAnswers((prev) => ({ ...prev, ...byQuestion }));
    });
  }, [sessionId]);

  // ---- Start a new session (sessionId === 'new') ----
  useEffect(() => {
    if (sessionId !== 'new') return;
    const courseId = searchParams?.get('courseId');
    if (!courseId) {
      setSubmitError('No course specified.');
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/test/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ courseId }),
        });
        const json = await res.json();
        if (!res.ok) {
          setSubmitError(json.error || 'Could not start test.');
          return;
        }
        router.replace(`/test/${json.sessionId}`);
      } catch {
        setSubmitError('Could not start test. Check your connection.');
      }
    })();
  }, [sessionId, searchParams, router]);

  // ---- Load an existing session ----
  useEffect(() => {
    if (!sessionId || sessionId === 'new') return;
    (async () => {
      // Try IndexedDB cache first (instant restore on weak connection).
      let cached: SessionCache | null = null;
      try { cached = await getCachedSession(sessionId); } catch {}

      let serverData: SessionResponse | null = null;
      try {
        const res = await fetch(`/api/test/session?sessionId=${sessionId}`, {
          headers: { 'Cache-Control': 'no-store' },
        });
        if (res.ok) serverData = await res.json();
      } catch {}

      if (serverData) {
        if (serverData.submittedAt) {
          router.replace(`/result/${serverData.sessionId}`);
          return;
        }
        setQuestions(serverData.questions);
        setAnswers(
          Object.fromEntries(
            Object.entries(serverData.answers ?? {}).map(([qId, v]) => [qId, (v as { letter: string }).letter])
          )
        );
        serverEndsAtRef.current = serverData.endsAt;
        syncTimer(serverData.endsAt);
        cacheSession({
          sessionId: serverData.sessionId,
          courseId: '', // not needed for resume UI
          endsAt: serverData.endsAt,
          durationMinutes: 0,
          questions: serverData.questions,
          questionOrder: serverData.questionOrder,
          optionOrders: serverData.optionOrders,
          startedAt: '',
        }).catch(() => {});
        startHeartbeat();
        startTick();
      } else if (cached) {
        // Cache only: no server contact possible yet.
        setQuestions(cached.questions);
        serverEndsAtRef.current = cached.endsAt;
        syncTimer(cached.endsAt);
        startTick();
        setIsPaused(true);
        setSubmitMessage('Running from cached session. Reconnecting to server…');
      } else {
        setSubmitError('Could not load this test session.');
      }
    })();

    return () => {
      stopHeartbeat();
      stopTick();
    };
  }, [sessionId, router]);

  // ---- Online/offline detection ----
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      setIsPaused(false);
      setSubmitMessage('');
      syncPendingAnswers();
      startHeartbeat();
    };
    const onOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // ---- Timer sync from heartbeat ----
  const syncTimer = useCallback((endsAt: string) => {
    serverEndsAtRef.current = endsAt;
    const serverNow = Date.now(); // heartbeat updates offsetRef itself
    lastSyncLocalRef.current = serverNow;
  }, []);

  const computeRemaining = useCallback((): number => {
    if (!serverEndsAtRef.current) return 0;
    const ends = new Date(serverEndsAtRef.current).getTime();
    // Approximate server now = local now + offset.
    const serverNow = Date.now() + offsetRef.current;
    return Math.max(0, Math.floor((ends - serverNow) / 1000));
  }, []);

  // ---- Heartbeat ----
  async function doHeartbeat() {
    if (!sessionId || sessionId === 'new') return;
    try {
      const res = await fetchWithTimeout('/api/test/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, clientSeq: seq }),
      });
      if (!res.ok) {
        handleDisconnect();
        return;
      }
      const json = await res.json();
      offsetRef.current = new Date(json.serverNow).getTime() - Date.now();
      lastSyncLocalRef.current = Date.now();
      serverEndsAtRef.current = json.endsAt;
      setIsPaused(false);
      setIsOnline(true);
      setSubmitMessage('');
      setPausedMinutesUsed(Math.round(json.pausedSeconds / 60));
      if (json.allowanceExhausted) {
        setSubmitMessage('Pause allowance used up — the clock now runs normally.');
      }
    } catch {
      handleDisconnect();
    }
  }

  function handleDisconnect() {
    setIsPaused(true);
    setIsOnline(false);
    setSubmitMessage('Connection lost. Your timer is paused and your answers are saved. Reconnect to continue.');
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(doHeartbeat, HEARTBEAT_MS);
    doHeartbeat();
  }
  function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  // ---- Tick (countdown) ----
  function startTick() {
    stopTick();
    tickTimer = setInterval(() => {
      if (isPaused) return;
      const rem = computeRemaining();
      setTimeRemaining(rem);
      if (rem <= 0) {
        stopTick();
        autoSubmit();
      }
    }, 1000);
    setTimeRemaining(computeRemaining());
  }
  function stopTick() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = null;
  }

  // ---- Autosave (debounced, optimistic) ----
  const markDirty = useCallback(() => {
    pendingDirty = true;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(syncPendingAnswers, AUTOSAVE_DEBOUNCE_MS);
  }, []);

  async function syncPendingAnswers() {
    if (!sessionId || sessionId === 'new') return;
    const pending = await getPendingAnswers(sessionId);
    if (pending.length === 0 && !pendingDirty) return;
    pendingDirty = false;

    // Build the payload: latest answer per question.
    const latestByQuestion: Record<string, { letter: string; seq: number }> = {};
    pending.forEach((p) => {
      const cur = latestByQuestion[p.questionId];
      if (!cur || p.seq > cur.seq) latestByQuestion[p.questionId] = { letter: p.letter, seq: p.seq };
    });

    // Also include current in-memory answers not yet persisted.
    Object.entries(answers).forEach(([qId, letter]) => {
      if (!latestByQuestion[qId]) {
        seq += 1;
        latestByQuestion[qId] = { letter, seq };
        savePendingAnswer({ id: `${sessionId}:${qId}`, sessionId, questionId: qId, letter, seq, ts: Date.now() });
      }
    });

    if (Object.keys(latestByQuestion).length === 0) return;

    try {
      const res = await fetchWithTimeout('/api/test/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, answers: latestByQuestion, clientSeq: seq }),
      });
      if (res.ok) {
        // Remove synced pending answers.
        pending.forEach((p) => removePendingAnswer(p.id));
        // Also clear in-memory ones we just sent.
        Object.keys(latestByQuestion).forEach((qId) => {
          removePendingAnswer(`${sessionId}:${qId}`);
        });
      }
    } catch {
      // Keep pending in IndexedDB; will retry on next autosave.
    }
  }

  // ---- Answer selection ----
  function selectOption(letter: OptionLetter) {
    if (isPaused || submitting) return;
    const qId = questions[currentIndex]?.id;
    if (!qId) return;
    setAnswers((prev) => {
      const next = { ...prev, [qId]: letter };
      return next;
    });
    seq += 1;
    void savePendingAnswer({
      id: `${sessionId}:${qId}`,
      sessionId,
      questionId: qId,
      letter,
      seq,
      ts: Date.now(),
    });
    markDirty();
  }

  // ---- Auto-submit (timer expiry) ----
  async function autoSubmit() {
    setSubmitting(true);
    setSubmitMessage('Time is up — submitting your test automatically…');
    await finalSubmit('auto_timeout');
  }

  // ---- Manual submit ----
  async function handleManualSubmit() {
    const unanswered = questions.filter((q) => !answers[q.id]).length;
    if (unanswered > 0) {
      if (!window.confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return;
    }
    setSubmitting(true);
    setSubmitMessage('Submitting your test, do not close this page…');
    await finalSubmit('manual');
  }

  // ---- Final submit (with retry) ----
  async function finalSubmit(submitType: 'manual' | 'auto_timeout') {
    if (!sessionId || sessionId === 'new') return;
    // Ensure all pending answers are included as a fallback.
    await syncPendingAnswers();

    const payload = {
      sessionId,
      answers: Object.entries(answers).map(([qId, letter]) => ({
        [qId]: { letter, seq: 0 },
      })),
      clientSeq: seq,
    } as any;

    // Flatten answers into the expected shape.
    const flatAnswers: Record<string, { letter: string; seq: number }> = {};
    Object.entries(answers).forEach(([qId, letter], i) => {
      flatAnswers[qId] = { letter, seq: i + 1 };
    });

    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const res = await fetchWithTimeout('/api/test/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, answers: flatAnswers, clientSeq: seq }),
        });
        if (res.ok) {
          const json = await res.json();
          await clearPendingAnswers(sessionId);
          await removeCachedSession(sessionId);
          setSubmitting(false);
          setSubmitMessage('Submitted. Your test has been graded.');
          stopTick();
          stopHeartbeat();
          setTimeout(() => router.replace(`/result/${json.graded?.sessionId ?? sessionId}`), 1500);
          return;
        }
        const errJson = await res.json().catch(() => ({}));
        lastErr = new Error(errJson.error || `Submit failed (${res.status})`);
      } catch (err: any) {
        lastErr = err;
      }
      // Exponential backoff before retry.
      await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 30_000)));
    }

    setSubmitting(false);
    setSubmitError(lastErr?.message || 'Submit is retrying in the background. Do not close this page.');
    // Keep retrying periodically.
    const retry = setInterval(async () => {
      try {
        const res = await fetchWithTimeout('/api/test/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, answers: flatAnswers, clientSeq: seq }),
        });
        if (res.ok) {
          const json = await res.json();
          await clearPendingAnswers(sessionId);
          await removeCachedSession(sessionId);
          setSubmitting(false);
          setSubmitMessage('Submitted. Your test has been graded.');
          stopTick();
          stopHeartbeat();
          clearInterval(retry);
          setTimeout(() => router.replace(`/result/${json.graded?.sessionId ?? sessionId}`), 1500);
        }
      } catch {
        // keep retrying
      }
    }, 10_000);
  }

  // ---- Fetch with timeout ----
  async function fetchWithTimeout(url: string, opts: RequestInit) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...opts, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- Beforeunload: persist pending answers ----
  useEffect(() => {
    const onBeforeUnload = () => {
      // Persist any in-memory answers not yet saved.
      Object.entries(answers).forEach(([qId, letter], i) => {
        seq += 1;
        void savePendingAnswer({
          id: `${sessionId}:${qId}`,
          sessionId,
          questionId: qId,
          letter,
          seq,
          ts: Date.now(),
        });
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [sessionId, answers]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isPaused || submitting) return;
      if (e.key >= '1' && e.key <= '4') {
        const idx = parseInt(e.key) - 1;
        const opt = ['A', 'B', 'C', 'D'][idx] as OptionLetter;
        selectOption(opt);
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentIndex((i) => (i > 0 ? i - 1 : questions.length - 1));
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentIndex((i) => (i < questions.length - 1 ? i + 1 : 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [questions, isPaused, submitting]);

  // When reconnecting after pause, sync pending answers.
  useEffect(() => {
    if (isOnline && !isPaused) {
      void syncPendingAnswers();
    }
  }, [isOnline, isPaused, sessionId]);

  if (!isOnline || isPaused) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="max-w-md p-6 bg-white rounded-xl shadow-2xl border border-slate-200 text-center">
          <div className="text-yellow-500 text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Connection Lost</h2>
          <p className="text-slate-600 mb-4">
            Your timer is paused and your answers are saved. Answering is
            locked until the connection returns.
          </p>
          {pausedMinutesUsed > 0 && (
            <p className="text-sm text-slate-500 mb-4">
              Pause time used: {pausedMinutesUsed} minute(s)
            </p>
          )}
          <p className="text-sm text-slate-400">{submitMessage || 'Reconnecting automatically…'}</p>
          <div className="mt-6">
            <button
              onClick={() => void syncPendingAnswers()}
              className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
            >
              Try reconnecting now
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (submitError && !questions.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <h2 className="text-lg font-bold text-red-700 mb-2">{submitError}</h2>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  const current = questions[currentIndex];
  const isAnswered = !!current?.id && !!answers[current.id];
  const mins = Math.floor(timeRemaining / 60);
  const secs = timeRemaining % 60;
  const isCritical = timeRemaining <= 5 * 60;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-3xl mx-auto">
        {/* Header + timer */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Test in Progress</h1>
            <p className="text-sm text-slate-600">
              Question {currentIndex + 1} of {questions.length}
            </p>
          </div>
          <div
            className={`px-4 py-2 rounded-lg font-bold text-slate-900 border ${
              isCritical
                ? 'bg-red-50 text-red-700 border-red-300 animate-pulse'
                : 'bg-white text-slate-700 border-slate-300'
            }`}
          >
            {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
          </div>
        </div>

        {submitMessage && (
          <div className="mb-4 p-3 rounded bg-blue-50 text-blue-700 text-sm border border-blue-100">
            {submitMessage}
          </div>
        )}

        {/* Question card */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-6">
          <div className="text-lg text-slate-800 mb-6 leading-relaxed">
            {currentIndex + 1}. {current?.question_text}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {current && ['A', 'B', 'C', 'D'].map((letter) => {
              const selected = answers[current.id] === letter;
              return (
                <button
                  key={letter}
                  onClick={() => selectOption(letter as OptionLetter)}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-left ${
                    selected
                      ? 'bg-blue-100 border-blue-600 text-blue-700 font-semibold'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="font-mono font-bold mr-2">{letter}</span>
                  {current.options[letter as OptionLetter]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Question grid */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Question grid (click to jump)
          </p>
          <div className="flex flex-wrap gap-2">
            {questions.map((_, i) => {
              const answered = !!answers[questions[i].id];
              const currentq = i === currentIndex;
              return (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  className={`w-8 h-8 rounded-full text-xs font-semibold ${
                    currentq
                      ? 'bg-blue-600 text-white'
                      : answered
                      ? 'bg-green-100 text-green-700 border border-green-300'
                      : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentIndex((i) => (i > 0 ? i - 1 : questions.length - 1))}
            disabled={currentIndex === 0 || isPaused || submitting}
            className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Previous
          </button>

          <button
            onClick={() =>
              setCurrentIndex((i) => (i < questions.length - 1 ? i + 1 : 0))}
            disabled={currentIndex === questions.length - 1 || isPaused || submitting}
            className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Next
          </button>

          <button
            onClick={handleManualSubmit}
            disabled={isPaused || submitting}
            className="px-6 py-2.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Submit Test'}
          </button>
        </div>
      </div>

      <div className="mt-4 text-xs text-slate-500 text-center max-w-3xl mx-auto">
        Keyboard: A–D to select • Arrow keys to navigate • Your answers save automatically
      </div>
    </div>
  );
}
