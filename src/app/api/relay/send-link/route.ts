import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  buildHeaders,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT,
  decryptAesGcm,
  generateSessionKey,
  solvePoW,
} from '@/lib/relay/relay';
import {
  checkOrigin,
  contactHint,
  forbiddenGeneric,
  hashApiKey,
  setSessionCookie,
  splitApiKey,
  tooManyRequests,
  unauthorizedGeneric,
  type RelaySessionData,
} from '@/lib/security/session-cookie';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import { getClientIp, hashIp } from '@/lib/security/ip';
import { securityLog } from '@/lib/security/security-log';
import { MAX_EMAILS_PER_KEY } from '@/lib/token/auth';

// Rate limits:
// - Per IP: 10 send-link attempts per 10 min (prevents brute force on apikeys)
// - Per API key prefix: 3 activations per 10 min (matches quota; any 4th
//   attempt within the window is rejected by the quota check anyway, but
//   this also slows down attackers who try many valid keys from one IP).
const IP_LIMIT = 10;
const IP_WINDOW_MS = 10 * 60 * 1000;
const KEY_LIMIT = 5; // slightly more than 3 quota so the legit 3 + 2 retries fit
const KEY_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  // CSRF: POST requires valid Origin.
  if (!checkOrigin(req)) {
    securityLog('csrf_invalid', 'warn', {
      endpoint: '/api/relay/send-link',
      ipHash: hashIp(getClientIp(req)),
    });
    return NextResponse.json(
      { ok: false, error: 'Permintaan ditolak (origin verification gagal).' },
      { status: 403 }
    );
  }

  const ip = getClientIp(req);
  const ipHash = hashIp(ip);

  // IP-level rate limit (apply BEFORE body parse — cheap pre-filter).
  const ipRl = checkRateLimit(rateLimitKey('sendlink:ip', ip), IP_LIMIT, IP_WINDOW_MS);
  if (!ipRl.allowed) {
    securityLog('rate_limit_hit', 'warn', {
      endpoint: '/api/relay/send-link',
      scope: 'ip',
      ipHash,
      limit: IP_LIMIT,
      retryAfterSec: ipRl.retryAfterSec,
    });
    return tooManyRequests(ipRl.retryAfterSec);
  }

  const body = await req.json().catch(() => ({}));
  const {
    email,
    apiKey,
    baseUrl = DEFAULT_BASE_URL,
    timeout = DEFAULT_TIMEOUT,
    customHeaders = {},
  } = body;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json(
      {
        ok: false,
        status: 400,
        error: 'Harap sediakan alamat email yang valid.',
        durationMs: Date.now() - startTime,
        attempts: 1,
      },
      { status: 400 }
    );
  }

  // Validate apikey format + lookup via prefix (constant-time hash compare).
  const split = splitApiKey(apiKey);
  if (!split.valid || !split.prefix) {
    securityLog('apikey_invalid', 'warn', {
      reason: 'format_or_prefix',
      ipHash,
      keyFingerprint: apiKey ? apiKey.slice(0, 13) + '…' : '<empty>',
    });
    // ANTI-ENUMERATION: don't reveal whether the prefix exists. Same generic
    // message as "expired" below.
    return unauthorizedGeneric();
  }

  // Per-key rate limit (keyed by prefix, not by IP, so a key shared across
  // browsers still has a single rate limit bucket).
  const keyRl = checkRateLimit(
    rateLimitKey('sendlink:key', split.prefix),
    KEY_LIMIT,
    KEY_WINDOW_MS
  );
  if (!keyRl.allowed) {
    securityLog('rate_limit_hit', 'warn', {
      endpoint: '/api/relay/send-link',
      scope: 'apikey',
      keyPrefix: split.prefix,
      limit: KEY_LIMIT,
      retryAfterSec: keyRl.retryAfterSec,
    });
    return tooManyRequests(keyRl.retryAfterSec);
  }

  // Look up by prefix (indexed). If no row OR hash mismatch, we return the
  // SAME generic error — no enumeration possible.
  const keyRecord = await db.apiKey
    .findUnique({ where: { keyPrefix: split.prefix } })
    .catch(() => null);

  // Constant-time hash compare.
  const submittedHash = hashApiKey(apiKey);
  let keyValid = false;
  if (keyRecord) {
    try {
      const a = Buffer.from(submittedHash, 'hex');
      const b = Buffer.from(keyRecord.keyHash, 'hex');
      if (a.length === b.length && a.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { timingSafeEqual } = require('crypto') as typeof import('crypto');
        keyValid = timingSafeEqual(a, b);
      }
    } catch {
      keyValid = false;
    }
  }

  if (!keyRecord || !keyValid) {
    securityLog('apikey_invalid', 'warn', {
      reason: 'not_found_or_hash_mismatch',
      ipHash,
      keyPrefix: split.prefix,
    });
    return unauthorizedGeneric();
  }

  if (keyRecord.expired || keyRecord.emailCount >= (keyRecord.maxEmails || MAX_EMAILS_PER_KEY)) {
    // Defensively mark as expired if not yet.
    if (!keyRecord.expired) {
      await db.apiKey
        .update({
          where: { id: keyRecord.id },
          data: { expired: true, expiredAt: new Date() },
        })
        .catch(() => null);
    }
    securityLog('apikey_expired', 'warn', {
      ipHash,
      keyPrefix: split.prefix,
    });
    return forbiddenGeneric();
  }

  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const headers = buildHeaders(cleanBaseUrl, customHeaders);

  try {
    // 1. Fetch challenge
    const challengeRes = await fetch(`${cleanBaseUrl}/api/send-challenge`, {
      method: 'GET',
      headers,
    });
    const challengeData = (await challengeRes.json()) as {
      success?: boolean;
      challenge: string;
      target?: string;
    };
    if (!challengeData || !challengeData.challenge) {
      throw new Error('challenge_unavailable');
    }

    // 2. Solve PoW
    const powNonce = solvePoW(challengeData.challenge, challengeData.target || '0000');

    // 3. Generate session key (this is the AES-GCM key the upstream uses
    //    to encrypt the verify-link response. It MUST stay server-side —
    //    we store it in a signed HttpOnly cookie, never return to client.)
    const sessionKey = generateSessionKey();

    // 4. Send request to upstream /api/send-link
    const sendPayload = {
      email: email.trim(),
      challenge: challengeData.challenge,
      pow: String(powNonce),
      key: sessionKey,
    };

    const response = await fetch(`${cleanBaseUrl}/api/send-link`, {
      method: 'POST',
      headers,
      body: JSON.stringify(sendPayload),
    });

    const resJson = await response.json();
    let finalData = resJson;
    if (resJson.enc) {
      try {
        finalData = decryptAesGcm(resJson.enc, sessionKey);
      } catch {
        securityLog('relay_upstream_error', 'error', {
          reason: 'decryption_failed',
          ipHash,
          keyPrefix: split.prefix,
        });
        return NextResponse.json(
          {
            ok: false,
            status: 502,
            error: 'Gagal memproses respon dari server target.',
            durationMs: Date.now() - startTime,
            attempts: 1,
          },
          { status: 502 }
        );
      }
    }

    const durationMs = Date.now() - startTime;
    const ok = response.ok && finalData.success !== false;

    if (ok) {
      // Increment usage; if this was the 3rd email, expire the key.
      const newCount = keyRecord.emailCount + 1;
      const willExpire = newCount >= (keyRecord.maxEmails || MAX_EMAILS_PER_KEY);
      try {
        await db.apiKey.update({
          where: { id: keyRecord.id },
          data: {
            emailCount: newCount,
            expired: willExpire,
            expiredAt: willExpire ? new Date() : null,
            lastUsedAt: new Date(),
            lastEmail: email.trim(),
          },
        });
        securityLog('apikey_quota_used', 'info', {
          keyPrefix: split.prefix,
          ipHash,
          emailCount: newCount,
          maxEmails: keyRecord.maxEmails || MAX_EMAILS_PER_KEY,
          willExpire,
        });
      } catch (err) {
        securityLog('apikey_quota_update_error', 'error', {
          keyPrefix: split.prefix,
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    }

    // Store sessionKey/nonce/challenge/pow in a SIGNED HttpOnly cookie —
    // never in a shared .session.json file, never returned in the JSON
    // body. The verify-link endpoint will read this cookie.
    const sessionData: RelaySessionData = {
      email: email.trim(),
      sessionKey,
      nonce: finalData.nonce || null,
      challenge: challengeData.challenge,
      pow: powNonce,
      apiKeyId: keyRecord.id,
      apiKeyRemaining: Math.max(
        0,
        (keyRecord.maxEmails || MAX_EMAILS_PER_KEY) -
          (ok ? keyRecord.emailCount + 1 : keyRecord.emailCount)
      ),
      apiKeyMax: keyRecord.maxEmails || MAX_EMAILS_PER_KEY,
      savedAt: new Date().toISOString(),
    };

    // RESPONSE MINIMIZATION: only return what the client genuinely needs.
    // - email (for display)
    // - ok flag, durationMs (for UX)
    // - apiKeyRemaining, apiKeyMax (for quota display)
    // - nonce: omit (server-side state only, kept in cookie)
    // - sessionKey/challenge/pow: never expose (would let client bypass)
    const res = NextResponse.json(
      {
        ok,
        status: ok ? 200 : response.status || 400,
        durationMs,
        attempts: 1,
        data: ok
          ? {
              // Pass through only non-sensitive fields from upstream
              success: finalData.success,
              message: finalData.message,
              nonce: finalData.nonce, // upstream puts this in their magic-link email — OK to echo
            }
          : finalData,
        apiKeyRemaining: sessionData.apiKeyRemaining,
        apiKeyMax: sessionData.apiKeyMax,
        ...contactHint(), // shown only when client sees an error
      },
      { status: ok ? 200 : response.status || 400 }
    );

    setSessionCookie(res, sessionData);
    return res;
  } catch (err: any) {
    securityLog('relay_upstream_error', 'error', {
      endpoint: '/api/relay/send-link',
      ipHash,
      keyPrefix: split.prefix,
      error: err?.message || 'unknown',
    });
    const durationMs = Date.now() - startTime;
    return NextResponse.json(
      {
        ok: false,
        status: 500,
        error: 'Kesalahan koneksi saat menghubungi server.',
        durationMs,
        attempts: 1,
      },
      { status: 500 }
    );
  }
}
