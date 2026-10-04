import { NextRequest, NextResponse } from 'next/server';
import {
  buildHeaders,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT,
  decryptAesGcm,
  generateSessionKey,
  loadLocalSession,
  saveLocalSession,
} from '@/lib/relay/relay';

export async function POST(req: NextRequest) {
  const startTime = Date.now();
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

  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const headers = buildHeaders(cleanBaseUrl, customHeaders);
  const session = loadLocalSession() || {};

  const effectiveEmail = clientEmail || session.email || '';
  const effectiveSessionKey =
    clientSessionKey || session.sessionKey || generateSessionKey();
  const effectiveNonce = clientNonce || session.nonce || null;

  if (!effectiveEmail) {
    return NextResponse.json(
      {
        ok: false,
        status: 400,
        error:
          'Email sesi belum tersedia. Harap jalankan Tahap 1 (Kirim Email) terlebih dahulu agar kunci sesi dan nonce dibuat.',
        durationMs: Date.now() - startTime,
        attempts: 1,
      },
      { status: 400 }
    );
  }

  try {
    // Protocol payload for verify-link
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

    // Decrypt if server returned encrypted payload
    if (resJson.enc) {
      try {
        finalData = decryptAesGcm(resJson.enc, effectiveSessionKey);
      } catch (err: any) {
        console.error('Decryption verify error:', err);
        return NextResponse.json(
          {
            ok: false,
            status: 502,
            data: resJson,
            error: 'Gagal mendeskripsi respon verifikasi (kunci sesi tidak cocok).',
            durationMs: Date.now() - startTime,
            attempts: 1,
          },
          { status: 502 }
        );
      }
    }

    const durationMs = Date.now() - startTime;
    const ok = response.ok && finalData.success !== false;

    const updatedSession = {
      ...session,
      email: effectiveEmail,
      sessionKey: effectiveSessionKey,
      lastVerifyInput: input.trim(),
      lastVerifyResponse: finalData,
      accountData: finalData.data || null,
      verifiedAt: ok ? new Date().toISOString() : session.verifiedAt || null,
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
        accountData: finalData.data || null,
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
        error: err.message || 'Kesalahan koneksi saat memverifikasi tautan.',
        durationMs,
        attempts: 1,
      },
      { status: 500 }
    );
  }
}
