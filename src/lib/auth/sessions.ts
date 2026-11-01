import { SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { STUDENT_SESSION_COOKIE, ADMIN_SESSION_COOKIE, cookieOptions } from './cookie';

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required');
}

const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET);

export async function createAdminSession() {
  const token = await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET);

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, token, cookieOptions(60 * 60 * 24 * 7));
}

export async function createStudentSession(studentId: string) {
  const token = await new SignJWT({ role: 'student', sub: studentId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(SECRET);

  const cookieStore = await cookies();
  cookieStore.set(STUDENT_SESSION_COOKIE, token, cookieOptions(60 * 60 * 12));
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, '', { ...cookieOptions(0), maxAge: 0 });
  cookieStore.set(STUDENT_SESSION_COOKIE, '', { ...cookieOptions(0), maxAge: 0 });
}
