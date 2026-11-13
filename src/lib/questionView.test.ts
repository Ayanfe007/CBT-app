import { describe, it, expect } from 'vitest';
import { toQuestionView, orderQuestions } from './questionView';

const q15minus7 = {
  id: 'q-15-7',
  question_text: 'What is 15 - 7?',
  option_a: '5',
  option_b: '6',
  option_c: '7',
  option_d: '8',
};

describe('toQuestionView', () => {
  it('always shows options A-D exactly as the admin entered them', () => {
    expect(toQuestionView(q15minus7).options).toEqual({ A: '5', B: '6', C: '7', D: '8' });
  });

  it('production case: the box labelled D shows "8", so clicking D matches correct_option D', () => {
    const view = toQuestionView(q15minus7);
    const clickedLetter = (Object.keys(view.options) as Array<'A' | 'B' | 'C' | 'D'>).find(
      (l) => view.options[l] === '8',
    );
    expect(clickedLetter).toBe('D');
  });

  it('has no way to be affected by a stale shuffled option_orders on an old session', () => {
    // The function only receives the question row; option_orders is never an input.
    expect(toQuestionView.length).toBe(1);
  });
});

describe('orderQuestions', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('returns rows in question_order regardless of the order the database returned them', () => {
    expect(orderQuestions(['c', 'a', 'b'], rows).map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('pairs by id, so a different row order from the database changes nothing', () => {
    const reversed = [...rows].reverse();
    expect(orderQuestions(['b', 'c', 'a'], reversed).map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('skips ids whose question was deleted and handles empty input', () => {
    expect(orderQuestions(['a', 'gone', 'b'], rows).map((r) => r.id)).toEqual(['a', 'b']);
    expect(orderQuestions(['a'], null)).toEqual([]);
  });
});
