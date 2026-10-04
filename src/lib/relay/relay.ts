import crypto from 'crypto';

// SECURITY: the old SESSION_FILE helpers (loadLocalSession, saveLocalSession,
// deleteLocalSession) have been REMOVED. Per-browser session state now lives
// in a signed HttpOnly cookie (see src/lib/security/session-cookie.ts).
// Removing these helpers eliminates the shared-state leak where any client
// could hit GET /api/relay/session and read another client's sessionKey.

export const DEFAULT_BASE_URL = 'https://am-web-three.vercel.app';
export const DEFAULT_TIMEOUT = 30000;
export const DEFAULT_MAX_RETRY = 3;

export function buildHeaders(baseUrl: string, extra: Record<string, string> = {}) {
  return {
    'accept': '*/*',
    'accept-encoding': 'gzip, deflate, br',
    'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'content-type': 'application/json',
    'origin': baseUrl,
    'referer': `${baseUrl}/`,
    'priority': 'u=1, i',
    'sec-ch-ua': '"Not=A?Brand";v="99", "Android WebView";v="151", "Chromium";v="151"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'x-requested-with': 'com.unixshells.devbrowser',
    ...extra,
  };
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function safeParse(data: any) {
  if (data && typeof data === 'object') return data;
  if (typeof data !== 'string') return { raw: data };
  try {
    return JSON.parse(data);
  } catch {
    return { raw: data };
  }
}

// Cryptographic helpers for am-web-three session handshake
export function generateSessionKey(): string {
  return crypto.randomBytes(32).toString('base64');
}

export function solvePoW(challenge: string, target = '0000'): number {
  let n = 0;
  while (n < 2000000) {
    const hash = crypto.createHash('sha256').update(challenge + ':' + n).digest('hex');
    if (hash.startsWith(target)) {
      return n;
    }
    n++;
  }
  throw new Error('Proof-of-work timeout');
}

export function decryptAesGcm(encBase64: string, keyBase64: string): any {
  const raw = Buffer.from(encBase64, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const keyBuf = Buffer.from(keyBase64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

// (loadLocalSession / saveLocalSession / deleteLocalSession removed — see
// module header comment. Per-browser session state now lives in a signed
// HttpOnly cookie via src/lib/security/session-cookie.ts.)
