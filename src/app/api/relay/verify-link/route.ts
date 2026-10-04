import { NextRequest, NextResponse } from 'next/server';
import {
  buildHeaders,
  DEFAULT_BASE_URL,
  decryptAesGcm,
  generateSessionKey,
} from '@/lib/relay/relay';
import {
  checkOrigin,
  clearSessionCookie,
  contactHint,
  readSessionCookie,
  type RelaySessionData,
} from '@/lib/security/session-cookie';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import { getClientIp, hashIp } from '@/lib/security/ip';
import { securityLog } from '@/lib/security/security-log';

const IP_LIMIT = 20;
const IP_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  if (!checkOrigin(req)) {
    securityLog('csrf_invalid', 'warn', {
      endpoint: '/api/relay/verify-link',
      ipHash: hashIp(getClientIp(req)),
    });
    return NextResponse.json(
      { ok: false, error: 'Permintaan ditolak (origin verification gagal).' },
      { status: 403 }
    );
  }

  const ip = getClientIp(req);
  const ipHash = hashIp(ip);

  const rl = checkRateLimit(rateLimitKey('verifylink:ip', ip), IP_LIMIT, IP_WINDOW_MS);
  if (!rl.allowed) {
    securityLog('rate_limit_hit', 'warn', {
      endpoint: '/api/relay/verify-link',
      ipHash,
      limit: IP_LIMIT,
      retryAfterSec: rl.retryAfterSec,
    });
    return NextResponse.json(
      {
        ok: false,
        status: 429,
        error: 'Terlalu banyak permintaan. Coba lagi beberapa saat.',
        retryAfter: rl.retryAfterSec,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSec) },
      }
    );
  }

  const body = await req.json().catch(() => ({}));
  const {
    input,
    email: clientEmail,
    sessionKey: clientSessionKey,
    nonce: clientNonce,
    baseUrl = DEFAULT_BASE_URL,
    customHeaders = {},
  } = body;

  if (!input || typeof input !== 'string') {
    return NextResponse.json(
      {
        ok: false,
        status: 400,
        error: 'Harap sediakan tautan verifikasi atau kode oobCode.',
        durationMs: Date.now() - startTime,
        attempts: 1,
      },
      { status: 400 }
    );
  }

  // Read per-browser signed session cookie (replaces the old shared
  // .session.json file). This cookie contains the sessionKey/nonce/
  // challenge/pow generated during send-link.
  const sess = readSessionCookie(req);

  // Allow client to override email/sessionKey/nonce via request body for
  // advanced use, but prefer cookie values (more trustworthy, server-issued).
  const effectiveEmail =
    (clientEmail as string | undefined) || sess?.email || '';
  const effectiveSessionKey =
    (clientSessionKey as string | undefined) || sess?.sessionKey || generateSessionKey();
  const effectiveNonce =
    (clientNonce as string | undefined) || sess?.nonce || null;

  if (!effectiveEmail) {
    return NextResponse.json(
      {
        ok: false,
        status: 400,
        error:
          'Email sesi belum tersedia. Harap jalankan Tahap 1 (Kirim Email) terlebih dahulu.',
        durationMs: Date.now() - startTime,
        attempts: 1,
      },
      { status: 400 }
    );
  }

  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const headers = buildHeaders(cleanBaseUrl, customHeaders);

  try {
    const verifyPayload = {
      email: effectiveEmail,
      magicLink: input.trim(),
      nonce: effectiveNonce,
      key: effectiveSessionKey,
    };

    const response = await fetch(`${cleanBaseUrl}/api/verify-link`, {
      method: 'POST',
      headers,
      body: JSON.stringify(verifyPayload),
    });

    const resJson = await response.json();
    let finalData = resJson;
    if (resJson.enc) {
      try {
        finalData = decryptAesGcm(resJson.enc, effectiveSessionKey);
      } catch {
        securityLog('relay_upstream_error', 'error', {
          endpoint: '/api/relay/verify-link',
          reason: 'decryption_failed',
          ipHash,
        });
        return NextResponse.json(
          {
            ok: false,
            status: 502,
            error: 'Gagal memproses respon verifikasi.',
            durationMs: Date.now() - startTime,
            attempts: 1,
          },
          { status: 502 }
        );
      }
    }

    const durationMs = Date.now() - startTime;
    const ok = response.ok && finalData.success !== false;

    // RESPONSE MINIMIZATION: don't echo back the upstream's full response.
    // Only return the fields the client actually needs.
    const res = NextResponse.json(
      {
        ok,
        status: ok ? 200 : response.status || 400,
        durationMs,
        attempts: 1,
        data: ok
          ? {
              success: finalData.success,
              message: finalData.message,
              email: finalData.email || effectiveEmail,
              uid: finalData.uid,
              orderId: finalData.orderId,
              idToken: finalData.idToken,
            }
          : {
              success: false,
              message: finalData.message || 'Verifikasi gagal.',
            },
        apiKeyRemaining: sess?.apiKeyRemaining ?? null,
        apiKeyMax: sess?.apiKeyMax ?? null,
        ...contactHint(),
      },
      { status: ok ? 200 : response.status || 400 }
    );

    // On success, clear the session cookie — the activation is done.
    if (ok) {
      clearSessionCookie(res);
      securityLog('apikey_quota_used', 'info', {
        event: 'verify_success',
        ipHash,
        email: effectiveEmail,
        apiKeyId: sess?.apiKeyId,
      });
    }

    return res;
  } catch (err: any) {
    securityLog('relay_upstream_error', 'error', {
      endpoint: '/api/relay/verify-link',
      ipHash,
      error: err?.message || 'unknown',
    });
    const durationMs = Date.now() - startTime;
    return NextResponse.json(
      {
        ok: false,
        status: 500,
        error: 'Kesalahan koneksi saat memverifikasi tautan.',
        durationMs,
        attempts: 1,
      },
      { status: 500 }
    );
  }
}

// Suppress unused var lint for RelaySessionData (type-only import).
void (null as unknown as RelaySessionData);
