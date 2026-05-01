import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/core/lib/auth.config';

const PUBLIC_PATHS = ['/', '/sign-in', '/api/auth', '/api/webhooks/repull', '/api/cron/sync'];

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/')) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon');
  if (isPublic) return NextResponse.next();
  if (!req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
