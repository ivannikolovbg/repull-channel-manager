/**
 * Edge middleware — soft auth gate.
 *
 * NextAuth's full `auth()` wrapper can't validate **database**-strategy
 * sessions from edge middleware (no adapter / pg driver in the edge runtime),
 * so it would mark every request as unauthenticated and redirect to /sign-in
 * even right after a successful sign-in. We instead do a presence-only check
 * for the session-token cookie here and let the page layout
 * (`app/(app)/layout.tsx`'s `requireSessionWorkspace`) perform the real
 * adapter-backed lookup in the Node runtime.
 *
 * Worst case: a forged cookie sneaks past the gate and is rejected by the
 * layout one hop later. Same protection level, no false redirect loops.
 */

import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/', '/sign-in', '/api/auth', '/api/webhooks/repull', '/api/cron/sync'];

const SESSION_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token'];

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/')) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon');
  if (isPublic) return NextResponse.next();

  const hasSession = SESSION_COOKIES.some((name) => req.cookies.get(name)?.value);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
