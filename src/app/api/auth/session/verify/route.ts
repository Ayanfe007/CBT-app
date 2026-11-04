import { NextResponse } from 'next/server';
import { verifyStudentSession } from '@/lib/auth/verify';
import { cookies } from 'next/headers';
import { STUDENT_SESSION_COOKIE, cookieOptions } from '@/lib/auth/cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const student = await verifyStudentSession();
  if (!student) {
    const cookieStore = await cookies();
    cookieStore.set(STUDENT_SESSION_COOKIE, '', {
      ...cookieOptions(0),
      maxAge: 0,
    });
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, studentId: student.studentId });
}
