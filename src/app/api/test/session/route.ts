import { NextResponse } from 'next/server';
import { verifyStudentSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const student = await verifyStudentSession();
  if (!student) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required.' }, { status: 400 });
  }

  // Verify ownership.
  const { data: session, error: fetchErr } = await supabaseAdmin
    .from('test_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (fetchErr || !session) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  }
  if (session.student_id !== student.studentId) {
    return NextResponse.json({ error: 'Not your session.' }, { status: 403 });
  }

  // Fetch questions (without correct_option).
  const { data: questions } = await supabaseAdmin
    .from('questions')
    .select('id, question_text, option_a, option_b, option_c, option_d')
    .eq('course_id', session.course_id);

  const qMap = new Map((questions ?? []).map((q) => [q.id, q]));
  const questionOrder = (session.question_order as string[]) ?? [];
  const optionOrders = (session.option_orders as Record<string, string[]>) ?? {};

  const questionsOut = questionOrder.map((id) => {
    const q = qMap.get(id);
    if (!q) return null;
    const shuffled = optionOrders[id] ?? ['A', 'B', 'C', 'D'];
    const letterToText: Record<string, string> = {
      A: q.option_a,
      B: q.option_b,
      C: q.option_c,
      D: q.option_d,
    };
    return {
      id: q.id,
      question_text: q.question_text,
      options: {
        A: letterToText[shuffled[0]],
        B: letterToText[shuffled[1]],
        C: letterToText[shuffled[2]],
        D: letterToText[shuffled[3]],
      },
    };
  }).filter(Boolean);

  return NextResponse.json({
    sessionId: session.id,
    endsAt: session.ends_at,
    questions: questionsOut,
    questionOrder,
    optionOrders,
    submittedAt: session.submitted_at,
    answers: session.answers,
  });
}
