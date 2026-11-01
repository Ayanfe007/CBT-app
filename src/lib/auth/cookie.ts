export const STUDENT_SESSION_COOKIE = 'student_session';
export const ADMIN_SESSION_COOKIE = 'admin_session';

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/' as const,
    maxAge,
  };
}
