export type OptionLetter = 'A' | 'B' | 'C' | 'D';

export interface StoredAnswer {
  letter: OptionLetter;
  seq: number;
}

export type StoredAnswerValue = string | { letter?: unknown; seq?: unknown } | null | undefined;

const OPTION_LETTERS = new Set<OptionLetter>(['A', 'B', 'C', 'D']);

export type StoredAnswerKind = 'missing' | 'letter' | 'unrecognized';

export function classifyStoredAnswer(value: unknown): StoredAnswerKind {
  if (value === null || value === undefined) return 'missing';
  return getAnswerLetter(value) ? 'letter' : 'unrecognized';
}

/** Read a choice from either the current { letter, seq } format or legacy flat-letter format. */
export function getAnswerLetter(value: unknown): OptionLetter | null {
  const letter =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object' && 'letter' in value
        ? (value as { letter?: unknown }).letter
        : null;

  return typeof letter === 'string' && OPTION_LETTERS.has(letter as OptionLetter)
    ? (letter as OptionLetter)
    : null;
}

/** Normalize a persisted answer map without translating or remapping A-D. */
export function normalizeStoredAnswers(value: unknown): Record<string, StoredAnswer> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const normalized: Record<string, StoredAnswer> = {};
  for (const [questionId, rawAnswer] of Object.entries(value as Record<string, StoredAnswerValue>)) {
    const letter = getAnswerLetter(rawAnswer);
    if (!letter) continue;

    const seq =
      rawAnswer && typeof rawAnswer === 'object' &&
      typeof rawAnswer.seq === 'number' && Number.isInteger(rawAnswer.seq) && rawAnswer.seq >= 0
        ? rawAnswer.seq
        : 0;

    normalized[questionId] = { letter, seq };
  }
  return normalized;
}
