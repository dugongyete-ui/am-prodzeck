import 'server-only';
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import * as ipMod from './ip';
import { securityLog } from './security-log';

// Wrapper functions so route handlers can import ALL security helpers
// from one module (`@/lib/security/session-cookie`) without having to know
// which sub-module each helper lives in. (Turbopack's static analysis
// sometimes misses plain `export { x } from './y'` re-exports, so we use
// explicit wrappers — semantically identical, just more lines.)
export function getClientIp(req: NextRequest | Request): string {
  return ipMod.getClientIp(req);
}
export function hashIp(ip: string): string {
  return ipMod.hashIp(ip);
}

// ────────────────────────────────────────────────────────────────────
// HMAC-signed per-browser session cookie. Replaces the shared .session.json
// file that previously leaked server-side session state to anyone hitting
// /api/relay/session. Now the sessionKey/nonce/challenge live in an
// HttpOnly, SameSite=Lax, short-lived signed cookie — one per browser.
// ────────────────────────────────────────────────────────────────────

const SESSION_COOKIE_NAME = 'dzeck_sess';
const SESSION_COOKIE_TTL_SEC = 15 * 60; // 15 min (matches upstream magic-link expiry)

// Cookie signing secret. Loaded from env so the production secret is not
// in the source code. Falls back to a per-process random value in dev so
// the feature still works without configuration.
const SESSION_COOKIE_SECRET =
  process.env.SESSION_COOKIE_SECRET ||
  crypto.randomBytes(32).toString('hex');

const SESSION_COOKIE_SALT = process.env.SESSION_COOKIE_SALT || 'dzeck-sess-v1';

export interface RelaySessionData {
  email: string;
  sessionKey: string;
  nonce: string | null;
  challenge: string;
  pow: number;
  apiKeyId?: string;
  apiKeyRemaining?: number;
  apiKeyMax?: number;
  savedAt: string;
}

function sign(payloadB64: string): string {
  return crypto.createHmac('sha256', SESSION_COOKIE_SECRET).update(payloadB64).digest('hex');
}

function pack(data: RelaySessionData): string {
  const payload = JSON.stringify(data);
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = sign(payloadB64);
  // Add salt rotation marker so changing the salt invalidates old cookies.
  const saltMarker = SESSION_COOKIE_SALT;
  return `${saltMarker}.${payloadB64}.${sig}`;
}

function unpack(cookieValue: string | undefined | null): RelaySessionData | null {
  if (!cookieValue) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return null;
  const [salt, payloadB64, sig] = parts;
  if (salt !== SESSION_COOKIE_SALT) return null;
  const expectedSig = sign(payloadB64);
  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expectedSig, 'hex');
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
    return JSON.parse(payload) as RelaySessionData;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: NextResponse, data: RelaySessionData): NextResponse {
  const value = pack(data);
  res.cookies.set(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_COOKIE_TTL_SEC,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}

export function readSessionCookie(req: NextRequest): RelaySessionData | null {
  const v = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!v) return null;
  const data = unpack(v);
  if (!data) {
    securityLog('session_cookie_invalid', 'warn', {
      ipHash: hashIp(getClientIp(req)),
    });
  }
  return data;
}

// ────────────────────────────────────────────────────────────────────
// CSRF protection: Origin + SameSite check. For cookie-authed state-
// changing requests, the Origin header must match the host. (SameSite=Lax
// already prevents most CSRF in modern browsers; this is defense-in-depth.)
// ────────────────────────────────────────────────────────────────────

// Build the list of allowed Origin values for CSRF check on state-changing
// requests. The "self" origin is derived from the request itself (so it
// works regardless of which domain the app is deployed at — localhost,
// Z.ai preview domain, or a custom domain). Additional origins can be
// added via the ALLOWED_ORIGINS env var (comma-separated).
//
// IMPORTANT: behind a TLS-terminating proxy/CDN (Cloudflare, Z.ai preview,
// Vercel, etc.), the server sees the request as `http://` even though the
// browser is on `https://`. Comparing the full Origin (with protocol) would
// mismatch in that case. So we compare HOSTS only — same host = same site.
// This is safe: an attacker on a different protocol of the same host is by
// definition same-origin (TLS termination is transparent to the browser).
function getAllowedOrigins(req: NextRequest): string[] {
  const extra = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Derive the request's own host (preferring forwarded headers for trusted
  // proxy setups).
  const host =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    req.nextUrl?.host ||
    '';
  const selfOrigins: string[] = [];
  if (host) {
    // Allow both http and https variants of the same host.
    selfOrigins.push(`http://${host}`, `https://${host}`);
  }
  // Always include localhost dev origins as a fallback.
  if (host !== 'localhost:3000') {
    selfOrigins.push('http://localhost:3000', 'https://localhost:3000');
  }
  return [...selfOrigins, ...extra];
}

// Extract just the host portion from an Origin or Referer URL — used for
// host-only comparison (protocol is unreliable behind TLS-terminating proxies).
function extractHost(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    return u.host; // e.g. "preview-xxx.space-z.ai" or "localhost:3000"
  } catch {
    return null;
  }
}

export function checkOrigin(req: NextRequest): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const allowed = getAllowedOrigins(req);
  const allowedHosts = allowed.map(extractHost).filter((h): h is string => Boolean(h));

  // If Origin header is present, it must match an allowed origin.
  if (origin) {
    const originHost = extractHost(origin);
    if (originHost && allowedHosts.includes(originHost)) return true;
    securityLog('origin_rejected', 'warn', {
      origin,
      allowed,
      ipHash: hashIp(getClientIp(req)),
      endpoint: req.nextUrl?.pathname || req.url,
      method,
    });
    return false;
  }

  // No Origin header. Some browsers strip it on same-origin — fall back to
  // Referer. If neither is present, reject (modern browsers always send one
  // of these on POST).
  if (referer) {
    const refererHost = extractHost(referer);
    if (refererHost && allowedHosts.includes(refererHost)) return true;
    securityLog('origin_rejected', 'warn', {
      referer,
      ipHash: hashIp(getClientIp(req)),
      endpoint: req.nextUrl?.pathname || req.url,
      method,
    });
    return false;
  }

  securityLog('origin_rejected', 'warn', {
    reason: 'no_origin_or_referer',
    ipHash: hashIp(getClientIp(req)),
    endpoint: req.nextUrl?.pathname || req.url,
    method,
  });
  return false;
}

// ────────────────────────────────────────────────────────────────────
// HMAC request signing for the most sensitive admin operations (apikey
// create / delete / reset). Provides anti-replay via timestamp + nonce.
//
// The per-session signing key is issued on admin login and stored in
// memory keyed by sessionId. The client receives the signingKey in the
// login response (visible to JS in that browser only) and uses it to sign
// state-changing requests.
// ────────────────────────────────────────────────────────────────────

const SIGNING_TOLERANCE_SEC = 60; // ±60s

// In-memory nonce cache for replay protection. Cleared after 5 min.
const nonceCache = new Map<string, number>(); // nonce → expiresAtMs
const NONCE_TTL_MS = 5 * 60 * 1000;

// In-memory store of admin sessions: sessionToken → { signingKey, expiresAtMs }.
interface AdminSession {
  signingKey: string;
  expiresAtMs: number;
}
const adminSessions = new Map<string, AdminSession>();

// Create a new signing-key entry for an already-issued session token. The
// session token is created by createSessionToken() in src/lib/token/auth.ts.
// We use the session token itself as the map key — it's already a 96-byte
// unguessable random string signed with HMAC.
export function registerAdminSigningKey(sessionToken: string, ttlMs = 4 * 60 * 60 * 1000): string {
  const signingKey = crypto.randomBytes(32).toString('hex');
  const expiresAtMs = Date.now() + ttlMs;
  adminSessions.set(sessionToken, { signingKey, expiresAtMs });
  return signingKey;
}

export function getAdminSigningKey(sessionToken: string | undefined | null): string | null {
  if (!sessionToken) return null;
  const s = adminSessions.get(sessionToken);
  if (!s) return null;
  if (Date.now() > s.expiresAtMs) {
    adminSessions.delete(sessionToken);
    return null;
  }
  return s.signingKey;
}

export function revokeAdminSession(sessionToken: string | undefined | null) {
  if (!sessionToken) return;
  adminSessions.delete(sessionToken);
}

// Backwards-compat aliases used elsewhere.
export function createAdminSession(sessionToken: string): { signingKey: string } {
  return { signingKey: registerAdminSigningKey(sessionToken) };
}

// Extract sessionId from the signed admin cookie. The cookie itself is
// verified by the existing session-token verification in auth.ts; this
// helper reads the *payload* of the verified token to know which session
// it belongs to.
export function extractSessionIdFromToken(token: string | undefined | null): string | null {
  if (!token) return null;
  // The session token format is `<base64url(payload)>.<hex sig>`. The payload
  // is JSON `{ t, seed }`. We don't store sessionId IN the token; instead
  // the token IS the session ID (we treat the whole token as the lookup key).
  // For signing-key lookup we use the token itself as the map key.
  return token;
}

export interface SignedRequestVerifyResult {
  ok: boolean;
  reason?: 'no_session' | 'no_signing_key' | 'missing_headers' | 'timestamp_skew' | 'nonce_replay' | 'signature_mismatch' | 'body_hash_mismatch';
}

export function verifySignedRequest(
  req: NextRequest,
  rawBody: string,
  sessionId: string
): SignedRequestVerifyResult {
  const signingKey = getAdminSigningKey(sessionId);
  if (!signingKey) {
    return { ok: false, reason: 'no_signing_key' };
  }

  const ts = req.headers.get('x-timestamp');
  const nonce = req.headers.get('x-nonce');
  const sig = req.headers.get('x-signature');
  if (!ts || !nonce || !sig) {
    return { ok: false, reason: 'missing_headers' };
  }

  // Timestamp within ±60s
  const tsNum = parseInt(ts, 10);
  if (isNaN(tsNum)) return { ok: false, reason: 'timestamp_skew' };
  const skewSec = Math.abs(Date.now() / 1000 - tsNum);
  if (skewSec > SIGNING_TOLERANCE_SEC) {
    return { ok: false, reason: 'timestamp_skew' };
  }

  // Nonce replay check
  const nonceKey = `${sessionId}:${nonce}`;
  const now = Date.now();
  // Cleanup expired nonces for this session
  for (const [k, expires] of nonceCache) {
    if (now > expires) nonceCache.delete(k);
  }
  if (nonceCache.has(nonceKey)) {
    return { ok: false, reason: 'nonce_replay' };
  }

  // Recompute expected signature
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const method = req.method.toUpperCase();
  const pathname = req.nextUrl?.pathname || '';
  const toSign = `${method}\n${pathname}\n${ts}\n${nonce}\n${bodyHash}`;
  const expectedSig = crypto.createHmac('sha256', signingKey).update(toSign).digest('hex');

  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expectedSig, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, reason: 'signature_mismatch' };
    }
  } catch {
    return { ok: false, reason: 'signature_mismatch' };
  }

  // All good — record nonce so it can't be reused.
  nonceCache.set(nonceKey, now + NONCE_TTL_MS);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────
// Generic API key handling helpers — sha256 hash + prefix extraction.
// ────────────────────────────────────────────────────────────────────

const APIKEY_PREFIX_LEN = 8; // first 8 hex chars after `dzk_`

export function splitApiKey(key: string): { prefix: string | null; valid: boolean } {
  if (!key) return { prefix: null, valid: false };
  const trimmed = key.trim();
  if (!trimmed.startsWith('dzk_')) return { prefix: null, valid: false };
  const rest = trimmed.slice(4);
  if (!/^[0-9a-f]{32}$/.test(rest)) return { prefix: null, valid: false };
  return { prefix: rest.slice(0, APIKEY_PREFIX_LEN), valid: true };
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key.trim()).digest('hex');
}

export function maskApiKey(key: string): string {
  // For display in admin list after first creation: dzk_<8hex>…<last4hex>
  if (!key || key.length < 16) return '***';
  return key.slice(0, 13) + '…' + key.slice(-4);
}

// ────────────────────────────────────────────────────────────────────
// Standard error responses (anti-enumeration friendly).
// ────────────────────────────────────────────────────────────────────

const ADMIN_WHATSAPP_TEXT =
  'Silahkan hubungi admin ke nomor WA wa.me/6282120056647 untuk minta apikey AM Premium baru.';
const ADMIN_WHATSAPP_URL = 'https://wa.me/6282120056647';

export function contactHint() {
  return {
    contactHint: ADMIN_WHATSAPP_TEXT,
    whatsappUrl: ADMIN_WHATSAPP_URL,
  };
}

export function tooManyRequests(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      status: 429,
      error: 'Terlalu banyak permintaan. Coba lagi beberapa saat.',
      retryAfter: retryAfterSec,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSec),
      },
    }
  );
}

export function unauthorizedGeneric(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      status: 401,
      error: 'Permintaan tidak dapat diproses.',
      ...contactHint(),
    },
    { status: 401 }
  );
}

export function forbiddenGeneric(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      status: 403,
      error: 'Apikey tidak valid atau sudah tidak aktif.',
      ...contactHint(),
    },
    { status: 403 }
  );
}

export function csrfError(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      status: 403,
      error: 'Permintaan ditolak (origin verification gagal).',
    },
    { status: 403 }
  );
}

export function badRequestGeneric(msg = 'Permintaan tidak valid.'): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      status: 400,
      error: msg,
    },
    { status: 400 }
  );
}
