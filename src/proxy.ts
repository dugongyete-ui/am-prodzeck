import { NextRequest, NextResponse } from 'next/server';

// Global security middleware — runs on every request that hits a route
// handler or static asset. Responsibilities:
//   1. Inject security response headers (CSP, HSTS, X-Content-Type-Options,
//      Referrer-Policy, Permissions-Policy, X-Frame-Options).
//   2. Block access to /api/relay/session (route removed; this is a
//      defense-in-depth fallback in case the route file is recreated).
//   3. Never set Access-Control-Allow-Origin: *.
//
// CSP is intentionally strict: same-origin for everything except
// fonts.googleapis.com (CSS) and fonts.gstatic.com (font files). Inline
// styles/scripts are allowed because Next.js + Turbopack rely on them
// in dev; tighten for production by extracting styles to a hash list if
// needed.
//
// NOTE: Next.js 16 deprecates the `middleware` file convention in favor of
// `proxy`. We export both names so the file works on 16.x and earlier.

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  // X-Frame-Options removed — replaced by CSP frame-ancestors below,
  // which is more expressive and allows the Z.ai chat preview iframe
  // (chat.z.ai) and Z.ai preview domains (*.space-z.ai) to embed our
  // app while still blocking arbitrary third-party sites.
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=()',
  // HSTS: only meaningful over HTTPS. Set max-age=2 years with preload.
  // (Sent on all responses; browsers will ignore it on plain HTTP.)
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  // CSP: lock everything to self. Allow inline styles (Next.js), allow
  // Google Fonts for the Plus Jakarta Sans + JetBrains Mono families.
  // `connect-src 'self'` blocks cross-origin fetches (so the relay
  // endpoint can't be replaced with an external URL by an attacker who
  // finds an XSS).
  //
  // `frame-ancestors` allows the Z.ai chat page (chat.z.ai) and Z.ai
  // preview domains (*.space-z.ai) to embed this app in an iframe —
  // this is REQUIRED for the Z.ai chat preview to render the deployed
  // app. Without this, the preview shows a sad-file icon.
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "frame-ancestors 'self' https://chat.z.ai https://*.space-z.ai",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; '),
};

// Paths that no client should ever reach. Even if a route handler is
// accidentally recreated at these paths, the proxy blocks it.
const BLOCKED_PATHS = new Set([
  '/api/relay/session',
]);

function apply(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (BLOCKED_PATHS.has(pathname)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // Inject security headers on every response (including static assets).
  const res = NextResponse.next({
    request: { headers: req.headers },
  });
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(k, v);
  }

  // Restrictive CORS: only same-origin by default. We don't set
  // Access-Control-Allow-Origin at all here — route handlers can opt in
  // per-route if cross-origin is genuinely needed (none of our routes
  // need it).
  // Don't set Access-Control-Allow-Credentials globally.

  return res;
}

// Next.js 16.x preferred name.
export function proxy(req: NextRequest) {
  return apply(req);
}

// Backwards-compat for Next.js 15.x / older 16.x builds.
export function middleware(req: NextRequest) {
  return apply(req);
}

export const config = {
  // Run on every path (including /, /token, /api/*, static assets).
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
