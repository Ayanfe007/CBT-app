import { describe, expect, it } from 'vitest';
import { classifyStoredAnswer, getAnswerLetter, normalizeStoredAnswers } from './answers';

describe('stored answer compatibility', () => {
  it('reads a legacy flat letter value', () => {
    expect(getAnswerLetter('A')).toBe('A');
  });

  it('reads the current letter-and-sequence value', () => {
    expect(getAnswerLetter({ letter: 'D', seq: 7 })).toBe('D');
  });

  it('does not turn missing or invalid values into an answer', () => {
    expect(getAnswerLetter(null)).toBeNull();
    expect(getAnswerLetter({ seq: 3 })).toBeNull();
    expect(getAnswerLetter('E')).toBeNull();
  });

  it('distinguishes no response from an unrecognized legacy value', () => {
    expect(classifyStoredAnswer(undefined)).toBe('missing');
    expect(classifyStoredAnswer('B')).toBe('letter');
    expect(classifyStoredAnswer('legacy-option-token')).toBe('unrecognized');
  });

  it('normalizes mixed legacy and current values without changing letters', () => {
    expect(normalizeStoredAnswers({
      q1: 'A',
      q2: { letter: 'C', seq: 9 },
      q3: { letter: 'invalid', seq: 10 },
      q4: null,
    })).toEqual({
      q1: { letter: 'A', seq: 0 },
      q2: { letter: 'C', seq: 9 },
    });
  });
});
