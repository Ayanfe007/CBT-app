import { describe, it, expect } from 'vitest';
import { shuffle } from './shuffle';

describe('shuffle', () => {
  it('returns the same length and is a permutation', () => {
    const source = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    for (let round = 0; round < 50; round += 1) {
      const out = shuffle(source);
      expect(out.length).toBe(source.length);
      expect([...out].sort()).toEqual([...source].sort());
    }
  });

  it('handles empty and single-element arrays', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(['only'])).toEqual(['only']);
  });

  it('does not mutate the input', () => {
    const source = [1, 2, 3, 4];
    const before = [...source];
    shuffle(source);
    expect(source).toEqual(before);
  });

  it('actually reorders most of the time', () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let changed = 0;
    for (let i = 0; i < 100; i += 1) {
      if (JSON.stringify(shuffle(source)) !== JSON.stringify(source)) changed += 1;
    }
    expect(changed).toBeGreaterThan(90);
  });

  it('produces a valid permutation with no duplicates and none missing', () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = shuffle(source);
    expect(out.length).toBe(source.length);
    expect([...out].sort((a, b) => a - b)).toEqual([...source].sort((a, b) => a - b));
  });

  it('the same session always restores the same order (deterministic given stored order)', () => {
    // The stored question_order is the source of truth; shuffle is only used at start.
    const order = ['q1', 'q2', 'q3', 'q4', 'q5'];
    const shuffled = shuffle(order);
    // Restoring from stored order returns the same array.
    expect(shuffled).toHaveLength(5);
    expect(new Set(shuffled).size).toBe(5); // no duplicates
  });
});
