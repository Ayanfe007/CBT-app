import { describe, it, expect } from 'vitest';
import { computePauseCredit, computeEffectiveEnd } from './pause';

const MAX_PAUSE_SECONDS = 20 * 60; // 20 minutes

describe('computePauseCredit', () => {
  it('grants no credit for a normal heartbeat gap (<= 45s)', () => {
    const r = computePauseCredit(30, 0, MAX_PAUSE_SECONDS);
    expect(r.pauseCreditSeconds).toBe(0);
    expect(r.newPausedSeconds).toBe(0);
    expect(r.allowanceExhausted).toBe(false);
    expect(r.remainingAllowanceSeconds).toBe(MAX_PAUSE_SECONDS);
  });

  it('grants no credit exactly at the 45s threshold', () => {
    const r = computePauseCredit(45, 0, MAX_PAUSE_SECONDS);
    expect(r.pauseCreditSeconds).toBe(0);
  });

  it('grants credit for a gap just above 45s (gap - 15s)', () => {
    const r = computePauseCredit(46, 0, MAX_PAUSE_SECONDS);
    expect(r.pauseCreditSeconds).toBe(31); // 46 - 15
    expect(r.newPausedSeconds).toBe(31);
  });

  it('credits a 10-minute disconnect gap', () => {
    const r = computePauseCredit(10 * 60, 0, MAX_PAUSE_SECONDS); // 600s gap
    expect(r.pauseCreditSeconds).toBe(600 - 15); // 585s
    expect(r.newPausedSeconds).toBe(585);
  });

  it('caps pause credit at the remaining allowance', () => {
    // Already used 15 minutes (900s), remaining = 300s.
    // A 30-minute disconnect gap would give 1785s credit, but only 300s available.
    const r = computePauseCredit(30 * 60, 900, MAX_PAUSE_SECONDS);
    expect(r.pauseCreditSeconds).toBe(300); // capped at remaining
    expect(r.newPausedSeconds).toBe(1200); // 900 + 300
    expect(r.allowanceExhausted).toBe(true);
    expect(r.remainingAllowanceSeconds).toBe(0);
  });

  it('never exceeds the cap even with a huge gap', () => {
    const r = computePauseCredit(24 * 60 * 60, 0, MAX_PAUSE_SECONDS); // 1 day gap
    expect(r.newPausedSeconds).toBe(MAX_PAUSE_SECONDS);
    expect(r.allowanceExhausted).toBe(true);
    expect(r.remainingAllowanceSeconds).toBe(0);
  });

  it('grants zero additional credit once the allowance is exhausted', () => {
    const r = computePauseCredit(10 * 60, MAX_PAUSE_SECONDS, MAX_PAUSE_SECONDS);
    expect(r.pauseCreditSeconds).toBe(0);
    expect(r.newPausedSeconds).toBe(MAX_PAUSE_SECONDS);
    expect(r.allowanceExhausted).toBe(true);
    expect(r.remainingAllowanceSeconds).toBe(0);
  });

  it('handles zero allowance (pausing disabled)', () => {
    const r = computePauseCredit(10 * 60, 0, 0);
    expect(r.pauseCreditSeconds).toBe(0);
    expect(r.newPausedSeconds).toBe(0);
    expect(r.allowanceExhausted).toBe(true);
  });
});

describe('computeEffectiveEnd', () => {
  it('returns ends_at when no pause has been used', () => {
    const endsAtMs = 1000000;
    expect(computeEffectiveEnd(endsAtMs, 0, MAX_PAUSE_SECONDS)).toBe(
      endsAtMs + MAX_PAUSE_SECONDS * 1000,
    );
  });

  it('accounts for remaining allowance', () => {
    // 5 minutes (300s) already paused → remaining = 900s (15 min).
    const endsAtMs = 1000000;
    const expected = endsAtMs + (MAX_PAUSE_SECONDS - 300) * 1000;
    expect(computeEffectiveEnd(endsAtMs, 300, MAX_PAUSE_SECONDS)).toBe(
      expected,
    );
  });

  it('equals ends_at when the allowance is fully used', () => {
    const endsAtMs = 1000000;
    expect(computeEffectiveEnd(endsAtMs, MAX_PAUSE_SECONDS, MAX_PAUSE_SECONDS)).toBe(
      endsAtMs,
    );
  });

  it('never goes below ends_at', () => {
    const endsAtMs = 1000000;
    const result = computeEffectiveEnd(endsAtMs, MAX_PAUSE_SECONDS + 500, MAX_PAUSE_SECONDS);
    expect(result).toBe(endsAtMs); // remaining clamped to 0
  });
});
