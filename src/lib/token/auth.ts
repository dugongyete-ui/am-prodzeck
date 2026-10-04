import 'server-only';
import crypto from 'crypto';

// Admin password is loaded from the environment (e.g. .env file or runtime
// env var). NEVER hardcode the password here — the source code is public.
// If TOKEN_ADMIN_PASSWORD is not set, every login attempt will fail.
function readAdminPassword(): string {
  const v = process.env.TOKEN_ADMIN_PASSWORD;
  if (!v || typeof v !== 'string' || v.length < 6) {
    return ''; // intentionally empty — auth will always fail
  }
  return v;
}

// HMAC signing secret for admin session tokens. Same idea: env var first,
// fallback to a per-process random value in dev.
const SESSION_SECRET =
  process.env.TOKEN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');

export function verifyAdminPassword(input: string | undefined | null): boolean {
  const expected = readAdminPassword();
  if (!expected || !input) return false;
  // Constant-time compare — no early-return timing leak.
  try {
    const a = Buffer.from(input);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Generate a signed session token. Token = base64url(payload).hex_signature
// where signature = HMAC-SHA256(payload_b64, SESSION_SECRET). Verifiable
// server-side without keeping per-token state (stateless).
export function createSessionToken(): string {
  const payload = JSON.stringify({
    t: Date.now(),
    seed: crypto.randomBytes(8).toString('hex'),
  });
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('hex');
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('hex');
  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expectedSig, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// API key generator: returns `dzk_<32 hex chars>`. The first 8 hex chars
// after `dzk_` are used as a non-secret lookup prefix (indexed in DB);
// the remaining 24 hex chars are the secret (compared via SHA-256 hash).
export function generateApiKey(): string {
  return 'dzk_' + crypto.randomBytes(16).toString('hex');
}

export const MAX_EMAILS_PER_KEY = 3;

// (ADMIN_WHATSAPP_URL / ADMIN_WHATSAPP_TEXT moved to
// src/lib/security/session-cookie.ts so all security + anti-enumeration
// helpers live in one place.)
