// Client-side helpers for HMAC request signing. The signing key is issued
// by the server on admin login (POST /api/token/auth) and held in memory
// only — never persisted to localStorage. State-changing admin requests
// (POST/DELETE/PATCH on /api/token/keys*) MUST include these headers:
//
//   X-Timestamp: <unix seconds>
//   X-Nonce:     <random hex string, unique per request>
//   X-Signature: <hex HMAC-SHA256 of: `${method}\n${pathname}\n${ts}\n${nonce}\n${bodyHash}`>
//
// The server verifies timestamp skew (±60s), nonce freshness (no reuse
// within 5 min), and signature validity.

async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const keyBuf = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', keyBuf, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomNonce(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export type SigningHeaders = Record<
  'X-Timestamp' | 'X-Nonce' | 'X-Signature',
  string
> & Record<string, string>;

// Build the signature headers for a state-changing admin request.
//   method:  'POST' | 'PATCH' | 'DELETE' | 'PUT'
//   pathname: e.g. '/api/token/keys' or '/api/token/keys/cmutiuiws0000pmxact00z8aj'
//   body:    the request body string (must match what fetch() actually sends)
//   signingKey: the signing key returned by /api/token/auth on login
export async function buildSigningHeaders(
  method: string,
  pathname: string,
  body: string,
  signingKey: string
): Promise<SigningHeaders> {
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomNonce();
  const bodyHash = await sha256Hex(body);
  const message = `${method.toUpperCase()}\n${pathname}\n${ts}\n${nonce}\n${bodyHash}`;
  const signature = await hmacSha256Hex(signingKey, message);
  return {
    'X-Timestamp': ts,
    'X-Nonce': nonce,
    'X-Signature': signature,
  };
}
