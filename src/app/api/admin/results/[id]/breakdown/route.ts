import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const { id } = await params;

  const { data: result } = await supabaseAdmin
    .from('test_results')
    .select('*, students(full_name), courses(course_code, title)')
    .eq('id', id)
    .maybeSingle();
  if (!result) {
    return NextResponse.json({ error: 'Result not found.' }, { status: 404 });
  }

  const { data: session } = await supabaseAdmin
    .from('test_sessions')
    .select('question_order, option_orders, answers')
    .eq('id', result.session_id)
    .maybeSingle();

  const { data: questions } = await supabaseAdmin
    .from('questions')
    .select('id, question_text, option_a, option_b, option_c, option_d, correct_option')
    .eq('course_id', result.course_id);

  const questionOrder = (session?.question_order as string[]) ?? [];
  const optionOrders = (session?.option_orders as Record<string, string[]>) ?? {};
  const answers = (session?.answers as Record<string, { letter: string }> | null) ?? {};
  const qMap = new Map((questions ?? []).map((q) => [q.id, q]));

  const breakdown = questionOrder.map((qId: string, idx: number) => {
    const q = qMap.get(qId);
    if (!q) return null;
    const shuffled = optionOrders[qId] ?? ['A', 'B', 'C', 'D'];
    const letterToText: Record<string, string> = {
      A: q.option_a,
      B: q.option_b,
      C: q.option_c,
      D: q.option_d,
    };
    const studentAnswer = answers[qId]?.letter ?? null;
    return {
      questionNumber: idx + 1,
      questionText: q.question_text,
      studentAnswer,
      correctAnswer: q.correct_option,
      isCorrect: studentAnswer === q.correct_option,
      options: {
        A: letterToText[shuffled[0]],
        B: letterToText[shuffled[1]],
        C: letterToText[shuffled[2]],
        D: letterToText[shuffled[3]],
      },
    };
  }).filter(Boolean);

  return NextResponse.json({ result, breakdown });
}
