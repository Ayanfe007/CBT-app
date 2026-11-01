import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { STUDENT_SESSION_COOKIE, ADMIN_SESSION_COOKIE } from './cookie';

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required');
}

const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET);

export async function verifyAdminSession(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

export type StudentSession = { studentId: string };

export async function verifyStudentSession(): Promise<StudentSession | null> {
  const token = (await cookies()).get(STUDENT_SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== 'student' || !payload.sub) return null;
    return { studentId: String(payload.sub) };
  } catch {
    return null;
  }
}
