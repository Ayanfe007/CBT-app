import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET!);

async function verifyToken(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as { role?: string; sub?: string };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const admin = await verifyToken(request.cookies.get('admin_session')?.value);
  const student = await verifyToken(request.cookies.get('student_session')?.value);

  const isAdminArea = pathname === '/admin' || pathname.startsWith('/admin/');
  const isAdminApi = pathname.startsWith('/api/admin/');
  const isStudentArea =
    pathname === '/dashboard' ||
    pathname.startsWith('/test/') ||
    pathname.startsWith('/api/test/');

  // Admin routes require a valid admin session cookie.
  if (isAdminArea || isAdminApi) {
    // Allow access to the login page without authentication.
    if (pathname === '/admin/login') {
      return NextResponse.next();
    }
    if (admin?.role !== 'admin') {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    return NextResponse.next();
  }

  if (pathname === '/admin/login' && admin?.role === 'admin') {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  // Student routes require a valid student session cookie.
  if (isStudentArea && student?.role !== 'student') {
    return NextResponse.redirect(
      new URL(`/?redirect=${encodeURIComponent(pathname)}`, request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/dashboard/:path*',
    '/test/:path*',
    '/api/test/:path*',
    '/admin/login',
  ],
};
