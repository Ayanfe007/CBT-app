import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { STUDENT_SESSION_COOKIE, ADMIN_SESSION_COOKIE } from '@/lib/auth/cookie';

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required');
}

const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET);

async function verifyToken(token: string | undefined, cookieName: string) {
  if (!token) {
    console.log(`[middleware] No ${cookieName} cookie`);
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, SECRET);
    console.log(`[middleware] Verified ${cookieName}:`, payload);
    return payload as { role?: string; sub?: string };
  } catch (err: any) {
    console.log(`[middleware] Failed to verify ${cookieName}:`, err.message);
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Never run on static assets or API routes
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/api/')
  ) {
    return NextResponse.next();
  }

  const adminCookie = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const studentCookie = request.cookies.get(STUDENT_SESSION_COOKIE)?.value;

  const admin = await verifyToken(adminCookie, ADMIN_SESSION_COOKIE);
  const student = await verifyToken(studentCookie, STUDENT_SESSION_COOKIE);

  const isAdminArea = pathname === '/admin' || pathname.startsWith('/admin/');
  const isStudentArea =
    pathname === '/dashboard' ||
    pathname.startsWith('/test/') ||
    pathname.startsWith('/result/');

  // Admin routes
  if (isAdminArea) {
    if (pathname === '/admin/login') {
      if (admin?.role === 'admin') {
        return NextResponse.redirect(new URL('/admin', request.url));
      }
      return NextResponse.next();
    }
    if (admin?.role !== 'admin') {
      console.log(`[middleware] Redirecting to /admin/login from ${pathname}`);
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    return NextResponse.next();
  }

  // Student routes
  if (isStudentArea) {
    if (student?.role !== 'student') {
      console.log(`[middleware] Redirecting to /login from ${pathname} (student=${!!student}, role=${student?.role})`);
      return NextResponse.redirect(new URL(`/login?redirect=${encodeURIComponent(pathname)}`, request.url));
    }
    return NextResponse.next();
  }

  // If already logged in and hits /login, redirect to dashboard
  if (pathname === '/login') {
    if (student?.role === 'student') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/dashboard/:path*',
    '/test/:path*',
    '/result/:path*',
    '/login',
  ],
};
