/**
 * Pure text parser: messy pasted questions -> structured questions.
 *
 * Supported:
 *   - Question numbering: "1.", "1)", "Q1.", "Q1:"
 *   - Option markers (case-insensitive): "a.", "a)", "(a)", "A:"
 *     (on the same line as the question or on separate lines)
 *   - Answer tags: "[Ans: A]", "Ans: A", "Answer: B", "(Answer - C)", "Correct: D"
 *
 * Returns one entry per question block. Valid questions are shaped as
 * ParsedQuestion; invalid ones are ParseError with the original text and a
 * readable reason. Never throws.
 */

export type CorrectOption = 'A' | 'B' | 'C' | 'D';

export interface ParsedQuestion {
  question_text: string;
  options: { A: string; B: string; C: string; D: string };
  correct_option: CorrectOption;
}

export interface ParseError {
  originalText: string;
  reason: string;
}

export type ParseResult = ParsedQuestion | ParseError;

export function isParsedQuestion(
  r: ParseResult,
): r is ParsedQuestion {
  return (r as ParsedQuestion).question_text !== undefined;
}

const ANSWER_TAGS: RegExp[] = [
  /\[\s*Ans\s*:\s*([A-D])\s*\]/i,
  /\bAns\s*:\s*([A-D])\b/i,
  /\bAnswer\s*:\s*([A-D])\b/i,
  /\(\s*Answer\s*[-:]\s*([A-D])\s*\)/i,
  /\bCorrect\s*:\s*([A-D])\b/i,
];

/** Matches a question number at the start of a line: 1. 1) Q1. Q1: */
const QUESTION_START = /^\s*(?:\d+[\.\)]|Q\d+[\.:])\s*/;

/** Matches an option at the start of a line: a. a) (a) A: */
const SEPARATE_OPTION = /^\s*(?:([a-dA-D])[\.\):]|\(([a-dA-D])\))\s*(.*)$/i;

/**
 * Splits raw text into question blocks. A new block begins whenever a line
 * matches QUESTION_START.
 */
function splitIntoBlocks(raw: string): string[] {
  const lines = raw.split(/\r?\n/);
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (QUESTION_START.test(line)) {
      if (current.length) blocks.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join('\n'));
  return blocks;
}

function extractAnswerTag(text: string): {
  textWithoutTag: string;
  correct_option: CorrectOption | null;
} {
  for (const re of ANSWER_TAGS) {
    const m = text.match(re);
    if (m) {
      return {
        textWithoutTag: text.replace(re, ' ').trim(),
        correct_option: m[1].toUpperCase() as CorrectOption,
      };
    }
  }
  return { textWithoutTag: text, correct_option: null };
}

/**
 * Tries to read options that each live on their own line starting with an
 * option marker. Returns { questionLines, options } or null if we can't
 * confidently read four distinct options A-D this way.
 */
function parseSeparateLineOptions(
  lines: string[],
): { questionLines: string[]; options: Record<string, string> } | null {
  const options: Record<string, string> = {};
  const questionLines: string[] = [];
  let firstOptionIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(SEPARATE_OPTION);
    if (m) {
      const letter = (m[1] || m[2]!).toUpperCase() as CorrectOption;
      const content = (m[3] ?? '').trim();
      if (firstOptionIdx === -1) firstOptionIdx = i;
      options[letter] = content;
    } else if (firstOptionIdx === -1) {
      questionLines.push(lines[i]);
    }
    // Lines after the first option that don't match the option pattern are
    // treated as continuations of the previous option's content.
    else if (firstOptionIdx !== -1) {
      const lastLetter = Object.keys(options).pop();
      if (lastLetter) {
        options[lastLetter] += ' ' + lines[i].trim();
      }
    }
  }

  const letters = Object.keys(options);
  if (
    letters.length >= 4 &&
    ['A', 'B', 'C', 'D'].every((l) => options[l] !== undefined && options[l]!.length > 0)
  ) {
    return { questionLines, options };
  }
  return null;
}

/**
 * Tries to read options inline (all on one line): "Question text? a. X b.
 * Y c. Z d. W". Splits on option markers. Conservative: only accepted if we
 * find four distinct options A-D.
 */
function parseInlineOptions(text: string): {
  question: string;
  options: Record<string, string>;
} | null {
  const markers: { idx: number; letter: string; end: number }[] = [];
  const re = /([a-dA-D])[\.\):]|\(([a-dA-D])\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const letter = (m[1] || m[2]!).toUpperCase() as CorrectOption;
    markers.push({ idx: m.index, letter, end: m.index + m[0].length });
  }

  if (markers.length < 4) return null;
  const letters = new Set(markers.map((x) => x.letter));
  if (!['A', 'B', 'C', 'D'].every((l) => letters.has(l))) return null;

  // Keep the first occurrence of each letter in order of appearance.
  const ordered: { idx: number; letter: string; end: number }[] = [];
  const seen = new Set<string>();
  for (const mr of markers) {
    if (!seen.has(mr.letter)) {
      seen.add(mr.letter);
      ordered.push(mr);
    }
  }
  ordered.sort((a, b) => a.idx - b.idx);

  const options: Record<string, string> = {};
  for (let i = 0; i < ordered.length; i++) {
    const start = ordered[i].end;
    const end = ordered[i + 1]?.idx ?? text.length;
    let content = text.slice(start, end).trim();
    // Strip a trailing answer tag that may have glued to the last option.
    content = content.replace(/\s*\[?\s*Ans\s*:\s*[A-D]\s*\]?\s*$/i, '').trim();
    options[ordered[i].letter] = content;
  }

  if (!['A', 'B', 'C', 'D'].every((l) => options[l] !== undefined && options[l]!.length > 0)) {
    return null;
  }

  return { question: text.slice(0, ordered[0].idx).trim(), options };
}

export function parseBlock(block: string): ParseResult {
  const originalText = block.trim();
  let text = originalText;

  // 1. Extract answer tag.
  const { textWithoutTag, correct_option } = extractAnswerTag(text);
  text = textWithoutTag;

  // 2. Strip question-number prefix from the first line.
  const lines = text.split(/\r?\n/);
  lines[0] = lines[0].replace(QUESTION_START, '');
  text = lines.join('\n');

  // 3. Try separate-line options first.
  const separate = parseSeparateLineOptions(text.split(/\r?\n/));
  if (separate && correct_option) {
    return {
      question_text: separate.questionLines.join(' ').trim(),
      options: {
        A: separate.options.A!,
        B: separate.options.B!,
        C: separate.options.C!,
        D: separate.options.D!,
      },
      correct_option,
    };
  }

  // 4. Try inline options.
  const inline = parseInlineOptions(text);
  if (inline && correct_option) {
    return {
      question_text: inline.question,
      options: { A: inline.options.A!, B: inline.options.B!, C: inline.options.C!, D: inline.options.D! },
      correct_option,
    };
  }

  // 5. Validation errors (readable, never throw).
  const reasons: string[] = [];
  if (!correct_option) {
    reasons.push('missing answer tag (e.g. [Ans: A], Ans: A, Answer: B, Correct: D)');
  }
  // Count option markers present anywhere in the block to give a helpful hint.
  const markerRe = /([a-dA-D])[\.\):]|\(([a-dA-D])\)/gi;
  const foundLetters = new Set<string>();
  let mm: RegExpExecArray | null;
  while ((mm = markerRe.exec(text)) !== null) {
    foundLetters.add((mm[1] || mm[2]!).toUpperCase());
  }
  if (foundLetters.size < 4) {
    reasons.push(`missing options (found ${foundLetters.size} of A-D; need all four)`);
  }
  if (reasons.length === 0) {
    reasons.push('could not parse question (expected options A-D and an answer tag)');
  }
  return { originalText, reason: reasons.join('; ') };
}

/**
 * Parse pasted text into an array of results. Valid questions and errors are
 * interleaved in the order they appeared.
 */
export function parseQuestions(raw: string): ParseResult[] {
  if (!raw || !raw.trim()) return [];
  return splitIntoBlocks(raw).map(parseBlock);
}
