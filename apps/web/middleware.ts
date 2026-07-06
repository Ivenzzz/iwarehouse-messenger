import { NextRequest, NextResponse } from 'next/server';

// Lightweight gate: without an access cookie, go to /login.
// Real authorization happens on the API for every request.
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has('iwm_access') || req.cookies.has('iwm_refresh');
  const isLogin = req.nextUrl.pathname.startsWith('/login');

  if (!hasSession && !isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  // Note: we deliberately do NOT redirect away from /login when cookies
  // exist — cookies can be stale (revoked session), and bouncing users back
  // into the app traps them on a broken screen. The login page handles the
  // already-signed-in case itself.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|icons|manifest.webmanifest|favicon.ico).*)'],
};
