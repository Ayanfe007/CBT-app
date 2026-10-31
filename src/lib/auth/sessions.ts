import { SignJWT } from 'jose';
import { cookies } from 'next/headers';

const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET!);
const ADMIN_COOKIE = 'admin_session';
const STUDENT_COOKIE = 'student_session';

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/' as const,
    maxAge,
  };
}

/** Admin session: issued after verifying ADMIN_PASSWORD. */
export async function createAdminSession() {
  const token = await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET);

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, token, cookieOptions(60 * 60 * 24 * 7));
}

/** Student session: issued after verifying login_id + bcrypt PIN. */
export async function createStudentSession(studentId: string) {
  const token = await new SignJWT({ role: 'student', sub: studentId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(SECRET);

  const cookieStore = await cookies();
  cookieStore.set(STUDENT_COOKIE, token, cookieOptions(60 * 60 * 12));
}

/** Clear both session cookies (logout). */
export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, '', { ...cookieOptions(0), maxAge: 0 });
  cookieStore.set(STUDENT_COOKIE, '', { ...cookieOptions(0), maxAge: 0 });
}
