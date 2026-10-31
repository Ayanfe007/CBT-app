import { z } from 'zod';
import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/verify';
import { parseQuestions, type ParseResult, isParsedQuestion } from '@/lib/parser';

const schema = z.object({ text: z.string().min(1) });

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
  }

  const results = parseQuestions(parsed.data.text);
  const valid = results.filter(isParsedQuestion) as ParseResult[];
  const errors = results.filter((r) => !isParsedQuestion(r)) as ParseResult[];

  return NextResponse.json({
    valid,
    errors,
    total: results.length,
    validCount: valid.length,
    errorCount: errors.length,
  });
}
