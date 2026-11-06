/**
 * The ONE place that turns a questions row into what a student/admin sees.
 *
 * Options ALWAYS display in the order the admin entered them: A = option_a,
 * B = option_b, C = option_c, D = option_d. Nothing here reads
 * test_sessions.option_orders, so old sessions that still have a shuffled
 * option_orders stored can no longer change what is shown.
 */
export interface QuestionRow {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

export interface QuestionView {
  id: string;
  question_text: string;
  options: { A: string; B: string; C: string; D: string };
}

export function toQuestionView(q: QuestionRow): QuestionView {
  return {
    id: q.id,
    question_text: q.question_text,
    options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
  };
}

/**
 * Pair a session's question_order with question rows BY ID (never by index or
 * by the order the database returned rows in).
 */
export function orderQuestions<T extends { id: string }>(
  questionOrder: string[],
  rows: T[] | null | undefined,
): T[] {
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  return questionOrder.map((id) => byId.get(id)).filter((r): r is T => !!r);
}
