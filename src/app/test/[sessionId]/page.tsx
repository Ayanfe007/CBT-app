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
import { isOfflineDisabled } from '@/lib/shutdown';

type OptionLetter = 'A' | 'B' | 'C' | 'D';

interface Question {
  id: string;
  question_text: string;
  options: Record<OptionLetter, string>;
}

interface SessionResponse {
  sessionId: string;
  endsAt: string;
  serverNow: string;
  questions: Question[];
  questionOrder: string[];
  optionOrders: Record<string, string[]>;
  submittedAt: string | null;
  answers: Record<string, string>;
  pausedSeconds: number;
}

type TestStatus =
  | 'loading'
  | 'load-failed'
  | 'active'
  | 'paused'
  | 'submitting'
  | 'submitted';

const HEARTBEAT_MS = 15_000;
const AUTOSAVE_DEBOUNCE_MS = 2_000;
const REQUEST_TIMEOUT_MS = 15_000;

export default function TestPage() {
  const { sessionId: rawSessionId } = useParams();
  const sessionId = typeof rawSessionId === 'string' ? rawSessionId : rawSessionId?.[0] ?? '';
  const [searchParams] = useSearchParams();
  const router = useRouter();

  const [status, setStatus] = useState<TestStatus>('loading');
  const [loadError, setLoadError] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedSeconds, setPausedSeconds] = useState(0);
  const [submitMessage, setSubmitMessage] = useState('');
  const [submitError, setSubmitError] = useState('');

  const serverEndsAtRef = useRef<string>('');
  const offsetRef = useRef(0);
  const lastSyncLocalRef = useRef(0);
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingDirty = false;
  let seq = 0;

  // ---------------- Load session ----------------
  useEffect(() => {
    if (!sessionId || sessionId === 'new') {
      const courseId = searchParams?.get('courseId');
      if (!courseId) {
        setStatus('load-failed');
        setLoadError('No course specified.');
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
            setStatus('load-failed');
            setLoadError(json.error || 'Could not start test.');
            return;
          }
          router.replace(`/test/${json.sessionId}`);
        } catch (err: any) {
          setStatus('load-failed');
          setLoadError(err.message || 'Could not start test.');
        }
      })();
      return;
    }

    let cancelled = false;

    (async () => {
      let cached: SessionCache | null = null;
      if (!isOfflineDisabled()) {
        try { cached = await getCachedSession(sessionId); } catch {}
      }

      let serverData: SessionResponse | null = null;
      try {
        const res = await fetch(`/api/test/session?sessionId=${sessionId}`, {
          headers: { 'Cache-Control': 'no-store' },
        });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            if (!cancelled) {
              setStatus('load-failed');
              setLoadError('Session expired. Please log in again.');
              setTimeout(() => router.push('/login'), 1500);
            }
            return;
          }
          throw new Error(`Server returned ${res.status}`);
        }
        serverData = await res.json();
      } catch (err: any) {
        if (cancelled) return;
        if (cached) {
          setQuestions(cached.questions);
          const pending = await getPendingAnswers(sessionId);
          setAnswers(
            Object.fromEntries(pending.map((p) => [p.questionId, p.letter]))
          );
          serverEndsAtRef.current = cached.endsAt;
          setStatus('active');
          setIsPaused(true);
          setSubmitMessage('Running from cached session. Reconnecting to server…');
          startTick();
          startHeartbeat();
          return;
        }
        setStatus('load-failed');
        setLoadError(err.message || 'Could not load your test.');
        return;
      }

      if (cancelled) return;

      if (serverData.submittedAt) {
        router.replace(`/result/${serverData.sessionId}`);
        return;
      }

      if (!serverData.questions || serverData.questions.length === 0) {
        setStatus('load-failed');
        setLoadError('No questions found for this session. Please contact your admin.');
        return;
      }

      setQuestions(serverData.questions);
      setAnswers(serverData.answers);
      serverEndsAtRef.current = serverData.endsAt;
      setPausedSeconds(serverData.pausedSeconds ?? 0);
      syncTimer(serverData.endsAt, serverData.serverNow);
      setStatus('active');

      if (!isOfflineDisabled()) {
        void cacheSession({
          sessionId: serverData.sessionId,
          courseId: '',
          endsAt: serverData.endsAt,
          durationMinutes: 0,
          questions: serverData.questions,
          questionOrder: serverData.questionOrder,
          optionOrders: serverData.optionOrders,
          startedAt: '',
        });
      }

      startHeartbeat();
      startTick();
    })();

    return () => {
      cancelled = true;
      stopHeartbeat();
      stopTick();
    };
  }, [sessionId, searchParams, router]);

  // ---------------- Online/offline detection ----------------
  useEffect(() => {
    const onOnline = () => {
      setIsPaused(false);
      setSubmitMessage('');
      void syncPendingAnswers();
      startHeartbeat();
    };
    const onOffline = () => {
      if (status === 'active') {
        setIsPaused(true);
        setSubmitMessage('Connection lost. Your timer is paused and your answers are saved. Reconnect to continue.');
      }
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [status]);

  // ---------------- Timer ----------------
  const syncTimer = useCallback((endsAt: string, serverNow?: string) => {
    serverEndsAtRef.current = endsAt;
    if (serverNow) {
      offsetRef.current = new Date(serverNow).getTime() - Date.now();
    }
    lastSyncLocalRef.current = Date.now();
  }, []);

  const computeRemaining = useCallback((): number => {
    if (!serverEndsAtRef.current) return 0;
    const ends = new Date(serverEndsAtRef.current).getTime();
    const serverNow = Date.now() + offsetRef.current;
    return Math.max(0, Math.floor((ends - serverNow) / 1000));
  }, []);

  // ---------------- Heartbeat ----------------
  async function doHeartbeat() {
    if (!sessionId || sessionId === 'new') return;
    try {
      const res = await fetchWithTimeout('/api/test/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, clientSeq: seq }),
      });
      if (!res.ok) return;
      const json = await res.json();
      offsetRef.current = new Date(json.serverNow).getTime() - Date.now();
      lastSyncLocalRef.current = Date.now();
      serverEndsAtRef.current = json.endsAt;
      setIsPaused(false);
      setSubmitMessage('');
      setPausedSeconds(json.pausedSeconds ?? 0);
      if (json.allowanceExhausted) {
        setSubmitMessage('Pause allowance used up — the clock now runs normally.');
      }
    } catch {
      // Network failure — handled by offline event
    }
  }

  function startHeartbeat() {
    if (isOfflineDisabled()) return;
    stopHeartbeat();
    heartbeatTimer = setInterval(doHeartbeat, HEARTBEAT_MS);
    doHeartbeat();
  }
  function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  // ---------------- Tick ----------------
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

  // ---------------- Autosave ----------------
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

    const latestByQuestion: Record<string, { letter: string; seq: number }> = {};
    pending.forEach((p) => {
      const cur = latestByQuestion[p.questionId];
      if (!cur || p.seq > cur.seq) latestByQuestion[p.questionId] = { letter: p.letter, seq: p.seq };
    });

    Object.entries(answers).forEach(([qId, letter]) => {
      if (!latestByQuestion[qId]) {
        seq += 1;
        latestByQuestion[qId] = { letter, seq };
        if (!isOfflineDisabled()) {
          void savePendingAnswer({
            id: `${sessionId}:${qId}`,
            sessionId,
            questionId: qId,
            letter,
            seq,
            ts: Date.now(),
          });
        }
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
        pending.forEach((p) => void removePendingAnswer(p.id));
        Object.keys(latestByQuestion).forEach((qId) => {
          void removePendingAnswer(`${sessionId}:${qId}`);
        });
      }
    } catch {
      // Keep pending in IndexedDB; will retry on next autosave.
    }
  }

  // ---------------- Answer selection ----------------
  function selectOption(letter: OptionLetter) {
    if (isPaused || status === 'submitting' || status === 'submitted') return;
    const qId = questions[currentIndex]?.id;
    if (!qId) return;
    setAnswers((prev) => {
      const next = { ...prev, [qId]: letter };
      return next;
    });
    seq += 1;
    if (!isOfflineDisabled()) {
      void savePendingAnswer({
        id: `${sessionId}:${qId}`,
        sessionId,
        questionId: qId,
        letter,
        seq,
        ts: Date.now(),
      });
    }
    markDirty();
  }

  // ---------------- Submit ----------------
  async function autoSubmit() {
    setStatus('submitting');
    setSubmitMessage('Time is up — submitting your test automatically…');
    await finalSubmit('auto_timeout');
  }

  async function handleManualSubmit() {
    if (status === 'submitting' || status === 'submitted') return;
    const unanswered = questions.filter((q) => !answers[q.id]).length;
    if (unanswered > 0) {
      if (!window.confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return;
    }
    setStatus('submitting');
    setSubmitMessage('Submitting your test, do not close this page…');
    await finalSubmit('manual');
  }

  async function handleCancelTest() {
    if (!window.confirm('Cancel this test? Your progress will be lost and you will return to the dashboard.')) return;
    setStatus('submitting');
    setSubmitMessage('Cancelling test…');
    try {
      await fetchWithTimeout('/api/test/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          answers: {},
          clientSeq: seq,
        }),
      });
    } catch {
      // ignore
    }
    stopTick();
    stopHeartbeat();
    router.push('/dashboard');
  }

  async function finalSubmit(submitType: 'manual' | 'auto_timeout') {
    if (!sessionId || sessionId === 'new') return;

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
          if (!isOfflineDisabled()) {
            await clearPendingAnswers(sessionId).catch(() => {});
            await removeCachedSession(sessionId).catch(() => {});
          }
          setStatus('submitted');
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
      await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 30_000)));
    }

    setStatus('active');
    setSubmitError(lastErr?.message || 'Submit is retrying in the background. Do not close this page.');
    setSubmitMessage('');

    const retry = setInterval(async () => {
      try {
        const res = await fetchWithTimeout('/api/test/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, answers: flatAnswers, clientSeq: seq }),
        });
        if (res.ok) {
          const json = await res.json();
          if (!isOfflineDisabled()) {
            await clearPendingAnswers(sessionId).catch(() => {});
            await removeCachedSession(sessionId).catch(() => {});
          }
          setStatus('submitted');
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

  // ---------------- Fetch with timeout ----------------
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

  // ---------------- Persist on beforeunload ----------------
  useEffect(() => {
    const onBeforeUnload = () => {
      Object.entries(answers).forEach(([qId, letter], i) => {
        seq += 1;
        if (!isOfflineDisabled()) {
          void savePendingAnswer({
            id: `${sessionId}:${qId}`,
            sessionId,
            questionId: qId,
            letter,
            seq,
            ts: Date.now(),
          });
        }
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [sessionId, answers]);

  // ---------------- Keyboard shortcuts ----------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isPaused || status === 'submitting' || status === 'submitted') return;
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
  }, [questions, isPaused, status]);

  // ---------------- Render ----------------

  // Loading skeleton
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-lg font-bold text-slate-900">Loading test…</h1>
            <div className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 font-bold">--:--</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-6">
            <div className="h-8 bg-slate-200 rounded w-full mb-4"></div>
            <div className="h-4 bg-slate-200 rounded w-3/4"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 bg-slate-200 rounded"></div>
              ))}
            )}
          </div>
        </div>
      </div>
    );
  }

  // Load failed
  if (status === 'load-failed') {
    return (
      <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">
        <div className="max-w-md bg-white rounded-lg border border-slate-200 p-6 shadow-sm text-center">
          <h2 className="text-xl font-bold text-slate-900 mb-2">Could not load your test</h2>
          <p className="text-slate-600 mb-4">{loadError}</p>
          <button
            onClick={() => {
              setStatus('loading');
              setLoadError('');
              router.refresh();
            }}
            className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            Retry
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 ml-2"
          >
            Back to dashboard
          </button>
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

  if (status === 'submitted') {
    return (
      <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">
        <div className="max-w-md bg-white rounded-lg border border-slate-200 p-6 shadow-sm text-center">
          <h2 className="text-xl font-bold text-slate-900 mb-2">Submitted</h2>
          <p className="text-slate-600">{submitMessage}</p>
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

        {submitError && (
          <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm border border-red-100">
            {submitError}
          </div>
        )}

        {/* Offline pause overlay */}
        {isPaused && status === 'active' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-sm">
            <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl text-center">
              <div className="text-yellow-500 text-4xl mb-4">⚠️</div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Connection Lost</h2>
              <p className="text-slate-600 mb-4">
                Your timer is paused and your answers are saved. Answering is locked until the connection returns.
              </p>
              <p className="text-sm text-slate-500 mb-4">
                Pause time used: {Math.floor(pausedSeconds / 60)}m {pausedSeconds % 60}s
              </p>
              <p className="text-sm text-slate-400">Reconnecting automatically…</p>
            </div>
          </div>
        )}

        {/* Question card */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-6">
          <div className="text-lg text-slate-800 mb-6 leading-relaxed">
            {currentIndex + 1}. {current?.question_text || 'Loading question…'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {current && ['A', 'B', 'C', 'D'].map((letter) => {
              const selected = answers[current.id] === letter;
              return (
                <button
                  key={letter}
                  onClick={() => selectOption(letter as OptionLetter)}
                  disabled={isPaused || status === 'submitting' || !current}
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
                  disabled={isPaused || status === 'submitting'}
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
            disabled={currentIndex === 0 || isPaused || status === 'submitting'}
            className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Previous
          </button>

          <button
            onClick={() =>
              setCurrentIndex((i) => (i < questions.length - 1 ? i + 1 : 0))
            }
            disabled={currentIndex === questions.length - 1 || isPaused || status === 'submitting'}
            className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Next
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCancelTest}
              disabled={isPaused || status === 'submitting'}
              className="px-5 py-2.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Cancel Test
            </button>
            <button
              onClick={handleManualSubmit}
              disabled={isPaused || status === 'submitting' || status === 'submitted'}
              className="px-6 py-2.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-60"
            >
              {status === 'submitting' ? 'Submitting…' : 'Submit Test'}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-slate-500 text-center max-w-3xl mx-auto">
        Keyboard: A–D to select • Arrow keys to navigate • Your answers save automatically
      </div>
    </div>
  );
}
