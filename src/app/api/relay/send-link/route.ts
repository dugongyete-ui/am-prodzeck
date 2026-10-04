import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  buildHeaders,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT,
  decryptAesGcm,
  generateSessionKey,
  saveLocalSession,
  solvePoW,
} from '@/lib/relay/relay';
import {
  ADMIN_WHATSAPP_TEXT,
  ADMIN_WHATSAPP_URL,
  MAX_EMAILS_PER_KEY,
} from '@/lib/token/auth';

const CONTACT_HINT = ADMIN_WHATSAPP_TEXT;

export async function POST(req: NextRequest) {
  const startTime = Date.now();
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

  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
    return NextResponse.json(
      {
        ok: false,
        status: 401,
        error: `Apikey wajib diisi. ${CONTACT_HINT}`,
        contactHint: CONTACT_HINT,
        whatsappUrl: ADMIN_WHATSAPP_URL,
        durationMs: Date.now() - startTime,
        attempts: 1,
      },
      { status: 401 }
    );
  }

  // Look up the API key in the database.
  const keyRecord = await db.apiKey
    .findUnique({ where: { key: apiKey.trim() } })
    .catch(() => null);

  if (!keyRecord) {
    return NextResponse.json(
      {
        ok: false,
        status: 401,
        error: `Apikey tidak dikenal. ${CONTACT_HINT}`,
        contactHint: CONTACT_HINT,
        whatsappUrl: ADMIN_WHATSAPP_URL,
        durationMs: Date.now() - startTime,
        attempts: 1,
      },
      { status: 401 }
    );
  }

  if (keyRecord.expired || keyRecord.emailCount >= MAX_EMAILS_PER_KEY) {
    // Mark as expired defensively if not yet.
    if (!keyRecord.expired) {
      await db.apiKey
        .update({
          where: { id: keyRecord.id },
          data: { expired: true, expiredAt: new Date() },
        })
        .catch(() => null);
    }
    return NextResponse.json(
      {
        ok: false,
        status: 403,
        error: `Apikey sudah tidak aktif (limit ${MAX_EMAILS_PER_KEY} email tercapai). ${CONTACT_HINT}`,
        contactHint: CONTACT_HINT,
        whatsappUrl: ADMIN_WHATSAPP_URL,
        keyExpired: true,
        keyEmailCount: keyRecord.emailCount,
        keyMaxEmails: MAX_EMAILS_PER_KEY,
        durationMs: Date.now() - startTime,
        attempts: 1,
      },
      { status: 403 }
    );
  }


  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const headers = buildHeaders(cleanBaseUrl, customHeaders);

  try {
    // 1. Fetch challenge from /api/send-challenge
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
      throw new Error('Gagal mendapatkan challenge dari server target.');
    }

    // 2. Solve Proof of Work
    const powNonce = solvePoW(challengeData.challenge, challengeData.target || '0000');

    // 3. Generate AES-256-GCM session key
    const sessionKey = generateSessionKey();

    // 4. Send request to /api/send-link
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

    // 5. Decrypt if payload is encrypted with key
    if (resJson.enc) {
      try {
        finalData = decryptAesGcm(resJson.enc, sessionKey);
      } catch (err: any) {
        console.error('Decryption error:', err);
        return NextResponse.json(
          {
            ok: false,
            status: 502,
            data: resJson,
            error:
              'Gagal mendeskripsi respon dari server target (kunci sesi tidak cocok).',
            durationMs: Date.now() - startTime,
            attempts: 1,
          },
          { status: 502 }
        );
      }
    }

    const durationMs = Date.now() - startTime;
    const ok = response.ok && finalData.success !== false;

    // Successful activation: bump the apikey usage counter. If this was the
    // 3rd email, expire the key right away so a 4th attempt is rejected.
    if (ok) {
      const newCount = keyRecord.emailCount + 1;
      const willExpire = newCount >= MAX_EMAILS_PER_KEY;
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
      } catch (err) {
        console.error('Failed to update apikey usage:', err);
      }
    }

    // Save active session with the negotiated key and nonce
    const updatedSession = {
      email: email.trim(),
      sessionKey,
      nonce: finalData.nonce || null,
      challenge: challengeData.challenge,
      pow: powNonce,
      lastSendPayload: sendPayload,
      lastSendResponse: finalData,
      savedAt: new Date().toISOString(),
      apiKeyId: keyRecord.id,
      apiKeyRemaining: Math.max(0, MAX_EMAILS_PER_KEY - (ok ? keyRecord.emailCount + 1 : keyRecord.emailCount)),
      apiKeyMax: MAX_EMAILS_PER_KEY,
    };
    saveLocalSession(updatedSession);

    return NextResponse.json(
      {
        ok,
        status: ok ? 200 : response.status || 400,
        headers: {},
        data: finalData,
        durationMs,
        attempts: 1,
        session: updatedSession,
        nonce: finalData.nonce || null,
        apiKeyRemaining: updatedSession.apiKeyRemaining,
        apiKeyMax: MAX_EMAILS_PER_KEY,
      },
      { status: ok ? 200 : response.status || 400 }
    );
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    return NextResponse.json(
      {
        ok: false,
        status: 500,
        data: null,
        error: err.message || 'Kesalahan koneksi saat menghubungi server.',
        durationMs,
        attempts: 1,
      },
      { status: 500 }
    );
  }
}
