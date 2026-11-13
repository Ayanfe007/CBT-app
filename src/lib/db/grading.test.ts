import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('./sessions', () => ({
  getSession: vi.fn(),
}));

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getSession } from './sessions';
import { gradeSession, regradeSession } from './grading';

const mockFrom = supabaseAdmin.from as unknown as ReturnType<typeof vi.fn>;
const mockGetSession = getSession as unknown as ReturnType<typeof vi.fn>;

/**
 * Build a chainable Supabase query mock.
 * All chain methods (.select, .eq, .in, .order, .update, .upsert) return `this`.
 * Awaiting the builder resolves with `terminalData`.
 * .single() and .maybeSingle() resolve with { data: terminalData, error: null }.
 */
function makeBuilder(terminalData: any) {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ error: null, count: 1 }),
    single: vi.fn().mockResolvedValue({ data: terminalData, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: terminalData, error: null }),
  };
  builder.then = vi.fn((resolve: any) => resolve({ data: terminalData, error: null }));
  return builder;
}

function mockSession(id: string = 's1', overrides: any = {}) {
  return {
    id,
    student_id: 'st1',
    course_id: 'c1',
    submitted_at: '2026-01-01T01:00:00Z',
    submit_type: 'manual',
    started_at: '2026-01-01T00:00:00Z',
    ends_at: '2026-01-01T01:00:00Z',
    paused_seconds: 0,
    disconnect_count: 0,
    question_order: ['q1', 'q2', 'q3'],
    answers: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(null);
  mockFrom.mockImplementation((table: string) => {
    if (table === 'courses') return makeBuilder({ pass_mark_percent: 50 });
    if (table === 'questions') return makeBuilder([]);
    if (table === 'test_results') return makeBuilder(null);
    if (table === 'test_sessions') return makeBuilder(null);
    return makeBuilder(null);
  });
});

function setQuestionsData(questions: any[]) {
  // We need to override the questions builder's then to return the given data.
  // Since mockFrom creates a new builder each call, we intercept by wrapping.
  const origFrom = mockFrom;
  (origFrom as any).mockImplementation((table: string) => {
    if (table === 'questions') {
      const b = makeBuilder(questions);
      return b;
    }
    if (table === 'courses') return makeBuilder({ pass_mark_percent: 50 });
    if (table === 'test_results') return makeBuilder(null);
    if (table === 'test_sessions') return makeBuilder(null);
    return makeBuilder(null);
  });
}

function mockSessionFn(id: string = 's1', overrides: any = {}) {
  return Promise.resolve(mockSession(id, overrides));
}

describe('gradeSession', () => {
  it('returns null for non-existent session', async () => {
    const result = await gradeSession('non-existent');
    expect(result).toBeNull();
  });

  it('correct letter scores 1 (production case: 15-7, correct D=8)', async () => {
    mockGetSession.mockImplementation(() =>
      mockSessionFn('s1', {
        question_order: ['q1'],
        answers: { q1: { letter: 'D', seq: 1 } },
      })
    );
    setQuestionsData([{ id: 'q1', correct_option: 'D' }]);

    const result = await gradeSession('s1', 'manual');
    expect(result?.score).toBe(1);
    expect(result?.percentage).toBe(100);
    expect(result?.passed).toBe(true);
  });

  it('grades a legacy flat-letter answer instead of treating it as blank', async () => {
    mockGetSession.mockImplementation(() =>
      mockSessionFn('s1', {
        question_order: ['q1'],
        answers: { q1: 'D' },
      })
    );
    setQuestionsData([{ id: 'q1', correct_option: 'D' }]);

    const result = await gradeSession('s1', 'manual');
    expect(result?.score).toBe(1);
    expect(result?.percentage).toBe(100);
    expect(result?.answers.q1).toEqual({ letter: 'D', seq: 0 });
  });

  it('wrong letters score 0', async () => {
    mockGetSession.mockImplementation(() =>
      mockSessionFn('s1', {
        question_order: ['q1'],
        answers: { q1: { letter: 'A', seq: 1 } },
      })
    );
    setQuestionsData([{ id: 'q1', correct_option: 'D' }]);

    const result = await gradeSession('s1', 'manual');
    expect(result?.score).toBe(0);
    expect(result?.percentage).toBe(0);
  });

  it('blank answer scores 0', async () => {
    mockGetSession.mockImplementation(() =>
      mockSessionFn('s1', {
        question_order: ['q1'],
        answers: {},
      })
    );
    setQuestionsData([{ id: 'q1', correct_option: 'D' }]);

    const result = await gradeSession('s1', 'manual');
    expect(result?.score).toBe(0);
  });

  it('exactly 10 correct and 20 wrong out of 30 gives 33.33%', async () => {
    const questionIds = Array.from({ length: 30 }, (_, i) => `q${i}`);
    const answers: Record<string, { letter: string; seq: number }> = {};
    questionIds.forEach((qId, i) => {
      answers[qId] = { letter: i < 10 ? 'D' : 'A', seq: i + 1 };
    });
    mockGetSession.mockImplementation(() =>
      mockSessionFn('s1', { question_order: questionIds, answers })
    );
    setQuestionsData(questionIds.map((qId) => ({ id: qId, correct_option: 'D' })));

    const result = await gradeSession('s1', 'manual');
    expect(result?.score).toBe(10);
    expect(result?.percentage).toBe(33.33);
  });

  it('two sessions with different question orders and same correct answers get same score', async () => {
    const answers1: Record<string, { letter: string; seq: number }> = {
      q1: { letter: 'D', seq: 1 },
      q2: { letter: 'D', seq: 2 },
      q3: { letter: 'D', seq: 3 },
    };
    const answers2: Record<string, { letter: string; seq: number }> = {
      q1: { letter: 'D', seq: 1 },
      q2: { letter: 'D', seq: 2 },
      q3: { letter: 'D', seq: 3 },
    };

    mockGetSession
      .mockResolvedValueOnce(mockSessionFn('s1', { question_order: ['q1', 'q2', 'q3'], answers: answers1 }))
      .mockResolvedValueOnce(mockSessionFn('s2', { question_order: ['q3', 'q2', 'q1'], answers: answers2 }));
    setQuestionsData([
      { id: 'q1', correct_option: 'D' },
      { id: 'q2', correct_option: 'D' },
      { id: 'q3', correct_option: 'D' },
    ]);

    const r1 = await gradeSession('s1', 'manual');
    const r2 = await gradeSession('s2', 'manual');
    expect(r1?.score).toBe(3);
    expect(r2?.score).toBe(3);
  });

  it('all correct gives 100% and all wrong gives 0%', async () => {
    mockGetSession
      .mockResolvedValueOnce(mockSessionFn('s1', {
        question_order: ['q1', 'q2'],
        answers: { q1: { letter: 'D', seq: 1 }, q2: { letter: 'D', seq: 2 } },
      }))
      .mockResolvedValueOnce(mockSessionFn('s2', {
        question_order: ['q1', 'q2'],
        answers: { q1: { letter: 'A', seq: 1 }, q2: { letter: 'B', seq: 2 } },
      }));
    setQuestionsData([
      { id: 'q1', correct_option: 'D' },
      { id: 'q2', correct_option: 'D' },
    ]);

    const rCorrect = await gradeSession('s1', 'manual');
    const rWrong = await gradeSession('s2', 'manual');
    expect(rCorrect?.percentage).toBe(100);
    expect(rWrong?.percentage).toBe(0);
  });
});

describe('regradeSession', () => {
  it('returns null for non-existent session', async () => {
    const result = await regradeSession('non-existent');
    expect(result).toBeNull();
  });

  it('throws if session is not submitted', async () => {
    mockGetSession.mockResolvedValue({ id: 's1', submitted_at: null });
    await expect(regradeSession('s1')).rejects.toThrow('Session is not submitted');
  });

  it('calls upsert with onConflict session_id (idempotent)', async () => {
    let resultsUpsertData: any[] = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'test_results') {
        const b = makeBuilder(null);
        b.upsert = vi.fn().mockImplementation((data: any) => {
          resultsUpsertData.push(data);
          return Promise.resolve({ error: null, count: 1 });
        });
        return b;
      }
      if (table === 'courses') return makeBuilder({ pass_mark_percent: 50 });
      if (table === 'questions') return makeBuilder([]);
      if (table === 'test_sessions') return makeBuilder(null);
      return makeBuilder(null);
    });
    mockGetSession.mockImplementation(() =>
      mockSessionFn('s1', { question_order: [], answers: {} })
    );

    const result = await regradeSession('s1');
    expect(result).not.toBeNull();
    expect(resultsUpsertData.length).toBe(1);
    expect(resultsUpsertData[0]).toEqual(expect.objectContaining({ session_id: 's1' }));
  });

  it('second call upserts the same session_id (no duplicate rows)', async () => {
    let resultsUpsertData: any[] = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'test_results') {
        const b = makeBuilder(null);
        b.upsert = vi.fn().mockImplementation((data: any) => {
          resultsUpsertData.push(data);
          return Promise.resolve({ error: null, count: 1 });
        });
        return b;
      }
      if (table === 'courses') return makeBuilder({ pass_mark_percent: 50 });
      if (table === 'questions') return makeBuilder([]);
      if (table === 'test_sessions') return makeBuilder(null);
      return makeBuilder(null);
    });
    mockGetSession.mockImplementation((id: string) =>
      mockSessionFn(id, { question_order: [], answers: {} })
    );

    await regradeSession('s2');
    await regradeSession('s2');

    expect(resultsUpsertData.length).toBe(2);
    expect(resultsUpsertData[0]).toEqual(expect.objectContaining({ session_id: 's2' }));
    expect(resultsUpsertData[1]).toEqual(expect.objectContaining({ session_id: 's2' }));
  });
});
