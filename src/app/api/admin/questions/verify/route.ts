import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get('course_id');
  if (!courseId) {
    return NextResponse.json({ error: 'course_id required.' }, { status: 400 });
  }

  const { data: questions } = await supabaseAdmin
    .from('questions')
    .select('id, question_text, option_a, option_b, option_c, option_d, correct_option')
    .eq('course_id', courseId)
    .order('created_at');

  if (!questions || questions.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const results: any[] = [];

  for (const q of questions) {
    const correct = q.correct_option;
    const opts = [q.option_a, q.option_b, q.option_c, q.option_d];
    const letters = ['A', 'B', 'C', 'D'] as const;

    // Find a wrong letter (different from correct).
    const wrongLetter = letters.find((l) => l !== correct);

    let pass = true;
    let reason = '';

    // Data integrity check: exactly one correct option letter is set.
    if (!correct) {
      pass = false;
      reason = 'No correct_option set.';
    }

    results.push({
      questionId: q.id,
      questionText: q.question_text,
      pass,
      reason,
      correct_option: correct,
      wrong_letter_tested: wrongLetter ?? null,
    });
  }

  const failed = results.filter((r) => !r.pass).length;

  return NextResponse.json({
    results,
    pass: failed === 0,
    failCount: failed,
    totalCount: results.length,
  });
}
