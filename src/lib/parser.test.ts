import { describe, it, expect } from 'vitest';
import { parseQuestions, type ParseResult, type ParsedQuestion, type ParseError, isParsedQuestion } from './parser';

function questionsOnly(results: ParseResult[]): ParsedQuestion[] {
  return results.filter(isParsedQuestion);
}
function errorsOnly(results: ParseResult[]): ParseError[] {
  return results.filter((r) => !isParsedQuestion(r)) as ParseError[];
}

describe('parser', () => {
  it('parses the §6 example correctly', () => {
    const input = '1. What is 15 - 7? a. 5 b. 6 c. 7 d. 8 [Ans: D]';
    const results = parseQuestions(input);
    const qs = questionsOnly(results);
    expect(qs.length).toBe(1);
    expect(qs[0].question_text).toBe('What is 15 - 7?');
    expect(qs[0].option_a).toBe('5');
    expect(qs[0].option_b).toBe('6');
    expect(qs[0].option_c).toBe('7');
    expect(qs[0].option_d).toBe('8');
    expect(qs[0].correct_option).toBe('D');
    expect(errorsOnly(results)).toHaveLength(0);
  });

  it('handles separate-line options', () => {
    const input = `1. What is 2+2?\na. Three\nb. Four\nc. Five\nd. Six\n[Ans: B]`;
    const qs = questionsOnly(parseQuestions(input));
    expect(qs.length).toBe(1);
    expect(qs[0].question_text).toBe('What is 2+2?');
    expect(qs[0].option_b).toBe('Four');
    expect(qs[0].correct_option).toBe('B');
  });

  it('handles Q1. / Q1: / 1) numbering', () => {
    const input = `Q1. What is HTML? a. Markup b. Snake c. Bird d. Car [Ans: A]
2) What is CSS? a. Style b. Soup c. Sand d. Rock [Ans: A]
Q3: What is JS? a. Logic b. Bread c. Juice d. Hat [Ans: A]`;
    const qs = questionsOnly(parseQuestions(input));
    expect(qs.length).toBe(3);
    expect(qs[0].question_text).toBe('What is HTML?');
    expect(qs[1].question_text).toBe('What is CSS?');
    expect(qs[2].question_text).toBe('What is JS?');
  });

  it('handles answer tag variants', () => {
    const cases: [string, 'A' | 'B' | 'C' | 'D'][] = [
      ['1. Q? a. A b. B c. C d. D Ans: C', 'C'],
      ['1. Q? a. A b. B c. C d. D (Answer - B)', 'B'],
      ['1. Q? a. A b. B c. C d. D Answer: D', 'D'],
      ['1. Q? a. A b. B c. C d. D Correct: A', 'A'],
    ];
    for (const [input, expected] of cases) {
      const qs = questionsOnly(parseQuestions(input));
      expect(qs[0].correct_option).toBe(expected);
    }
  });

  it('trims whitespace', () => {
    const input = '   1.   What is 15 - 7?   a. 5   b. 6   c. 7   d. 8   [Ans: D]   ';
    const qs = questionsOnly(parseQuestions(input));
    expect(qs[0].question_text).toBe('What is 15 - 7?');
    expect(qs[0].option_a).toBe('5');
    expect(qs[0].correct_option).toBe('D');
  });

  it('returns a readable error for missing answer', () => {
    const input = '1. What is 15 - 7? a. 5 b. 6 c. 7 d. 8';
    const results = parseQuestions(input);
    expect(questionsOnly(results)).toHaveLength(0);
    const errs = errorsOnly(results);
    expect(errs.length).toBe(1);
    expect(errs[0].reason).toContain('missing answer tag');
    expect(errs[0].originalText).toContain('What is 15 - 7?');
  });

  it('returns a readable error for fewer than 4 options', () => {
    const input = '1. What is 15 - 7? a. 5 b. 6 c. 7 [Ans: D]';
    const results = parseQuestions(input);
    expect(questionsOnly(results)).toHaveLength(0);
    const errs = errorsOnly(results);
    expect(errs.length).toBe(1);
    expect(errs[0].reason).toContain('missing options');
  });

  it('returns a readable error for missing options and answer', () => {
    const input = '1. What is 15 - 7? a. 5 b. 6';
    const results = parseQuestions(input);
    expect(questionsOnly(results)).toHaveLength(0);
    const errs = errorsOnly(results);
    expect(errs.length).toBe(1);
    expect(errs[0].reason).toContain('missing answer tag');
    expect(errs[0].reason).toContain('missing options');
  });

  it('parses multiple questions and isolates failures', () => {
    const input = `1. Good one? a. A b. B c. C d. D [Ans: A]
2. Broken one? a. Only one b. Only two
3. Another good? a. W b. X c. Y d. Z [Ans: D]`;
    const results = parseQuestions(input);
    expect(questionsOnly(results).length).toBe(2);
    expect(errorsOnly(results).length).toBe(1);
  });

  it('returns empty array for empty input', () => {
    expect(parseQuestions('')).toEqual([]);
    expect(parseQuestions('\n\n')).toEqual([]);
  });
});
