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

const SESSION_SECRET = process.env.TOKEN_SESSION_SECRET || 'dzeck-token-admin-session-v1-fallback';

export function verifyAdminPassword(input: string | undefined | null): boolean {
  const expected = readAdminPassword();
  if (!expected || !input) return false;
  // Constant-time compare to avoid timing leaks.
  try {
    const a = Buffer.from(input);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Generate a signed session token so the admin client doesn't have to
// keep re-sending the raw password on every request. Token = base64(payload).signature
// where signature = HMAC-SHA256(payload, SESSION_SECRET). Verifiable server-side.
export function createSessionToken(): string {
  const payload = JSON.stringify({ t: Date.now(), seed: crypto.randomBytes(8).toString('hex') });
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

// API key generator: dzk_<32 hex chars> = 37 chars, easy to copy/paste,
// has a recognizable prefix, and enough entropy to be unguessable.
export function generateApiKey(): string {
  return 'dzk_' + crypto.randomBytes(16).toString('hex');
}

export const MAX_EMAILS_PER_KEY = 3;

export const ADMIN_WHATSAPP_URL = 'https://wa.me/6282120056647';
export const ADMIN_WHATSAPP_TEXT =
  'Silahkan hubungi admin ke nomor WA wa.me/6282120056647 untuk minta apikey AM Premium baru.';
