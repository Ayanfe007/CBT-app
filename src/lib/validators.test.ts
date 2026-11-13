import { describe, it, expect } from 'vitest';
import { startTestSchema } from './validators';

describe('startTestSchema', () => {
  it('accepts a valid UUID courseId', () => {
    const parsed = startTestSchema.safeParse({
      courseId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.courseId).toBe('550e8400-e29b-41d4-a716-446655440000');
    }
  });

  it('rejects a non-UUID courseId', () => {
    const parsed = startTestSchema.safeParse({ courseId: 'not-a-uuid' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].path).toEqual(['courseId']);
    }
  });

  it('rejects a missing courseId', () => {
    const parsed = startTestSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });
});

/**
 * Pure: count completed attempts excluding abandoned sessions.
 * Mirrors the attempt-counting logic in /api/test/start.
 */
export function countCompletedAttempts(sessions: Array<{
  submitted_at: string | null;
  submit_type: string | null;
}>): number {
  return sessions.filter(
    (s) => s.submitted_at && s.submit_type !== 'abandoned'
  ).length;
}

describe('countCompletedAttempts (excludes abandoned)', () => {
  it('counts only non-abandoned submitted sessions', () => {
    const sessions = [
      { submitted_at: '2026-01-01', submit_type: 'manual' },
      { submitted_at: '2026-01-02', submit_type: 'auto_timeout' },
      { submitted_at: '2026-01-03', submit_type: 'abandoned' },
      { submitted_at: null, submit_type: null },
    ];
    expect(countCompletedAttempts(sessions)).toBe(2);
  });

  it('returns 0 when all submitted are abandoned', () => {
    const sessions = [
      { submitted_at: '2026-01-01', submit_type: 'abandoned' },
      { submitted_at: '2026-01-02', submit_type: 'abandoned' },
    ];
    expect(countCompletedAttempts(sessions)).toBe(0);
  });

  it('returns 0 when no sessions submitted', () => {
    const sessions = [{ submitted_at: null, submit_type: null }];
    expect(countCompletedAttempts(sessions)).toBe(0);
  });
});
