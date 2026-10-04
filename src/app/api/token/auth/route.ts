import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  createSessionToken,
  generateApiKey,
  MAX_EMAILS_PER_KEY,
  verifyAdminPassword,
} from '@/lib/token/auth';
import {
  checkOrigin,
  registerAdminSigningKey,
  tooManyRequests,
  unauthorizedGeneric,
} from '@/lib/security/session-cookie';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import { getClientIp, hashIp } from '@/lib/security/ip';
import { securityLog } from '@/lib/security/security-log';

// Rate limit: 5 failed login attempts per IP per 15 min. After lockout,
// even the correct password is rejected until the window clears.
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  // CSRF: POST requires a valid Origin header (defense-in-depth on top of
  // SameSite cookies).
  if (!checkOrigin(req)) {
    securityLog('csrf_invalid', 'warn', {
      endpoint: '/api/token/auth',
      ipHash: hashIp(getClientIp(req)),
    });
    return NextResponse.json(
      { ok: false, error: 'Permintaan ditolak (origin verification gagal).' },
      { status: 403 }
    );
  }

  const ip = getClientIp(req);
  const ipHash = hashIp(ip);
  const bucketKey = rateLimitKey('login', ip);
  const rl = checkRateLimit(bucketKey, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!rl.allowed) {
    securityLog('rate_limit_hit', 'warn', {
      endpoint: '/api/token/auth',
      ipHash,
      limit: LOGIN_LIMIT,
      retryAfterSec: rl.retryAfterSec,
    });
    return tooManyRequests(rl.retryAfterSec);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const password = typeof body?.password === 'string' ? body.password : '';

  securityLog('admin_login_attempt', 'info', { ipHash });

  if (!verifyAdminPassword(password)) {
    securityLog('admin_login_failure', 'warn', { ipHash });
    // Generic error: don't reveal whether the password env var is even set.
    return unauthorizedGeneric();
  }

  // Successful login: issue signed session token, set HttpOnly cookie,
  // and register a per-session signing key for HMAC request signing.
  const sessionToken = createSessionToken();
  const signingKey = registerAdminSigningKey(sessionToken);

  const res = NextResponse.json({
    ok: true,
    sessionToken,
    signingKey, // client holds this in-memory only (not localStorage)
  });
  res.cookies.set('dzeck_admin', sessionToken, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 4, // 4 hours
    secure: process.env.NODE_ENV === 'production',
  });
  securityLog('admin_login_success', 'info', { ipHash });
  return res;
}

export async function DELETE(req: NextRequest) {
  // Read session token from cookie, revoke in-memory signing key, clear cookie.
  const token = req.cookies.get('dzeck_admin')?.value;
  if (token) {
    // We don't need to verify the signature for logout — just delete the
    // in-memory signing key if it exists.
    registerAdminSigningKey(token, -1); // negative ttl = immediately expired
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set('dzeck_admin', '', {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
  });
  securityLog('admin_logout', 'info', { ipHash: hashIp(getClientIp(req)) });
  return res;
}
