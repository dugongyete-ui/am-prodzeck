import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { MAX_EMAILS_PER_KEY, verifySessionToken } from '@/lib/token/auth';
import {
  checkOrigin,
  tooManyRequests,
  unauthorizedGeneric,
  verifySignedRequest,
} from '@/lib/security/session-cookie';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import { getClientIp, hashIp } from '@/lib/security/ip';
import { securityLog } from '@/lib/security/security-log';

const STATE_LIMIT = 30; // per hour per session
const STATE_WINDOW_MS = 60 * 60 * 1000;

function isAuthed(req: NextRequest): { ok: true; sessionToken: string } | { ok: false } {
  const cookie = req.cookies.get('dzeck_admin')?.value;
  if (cookie && verifySessionToken(cookie)) {
    return { ok: true, sessionToken: cookie };
  }
  const header = req.headers.get('x-admin-session');
  if (header && verifySessionToken(header)) {
    return { ok: true, sessionToken: header };
  }
  return { ok: false };
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = isAuthed(req);
  if (!auth.ok) {
    securityLog('unauthorized_request', 'warn', {
      endpoint: '/api/token/keys/[id]',
      method: 'DELETE',
      ipHash: hashIp(getClientIp(req)),
    });
    return unauthorizedGeneric();
  }
  if (!checkOrigin(req)) {
    securityLog('csrf_invalid', 'warn', {
      endpoint: '/api/token/keys/[id]',
      method: 'DELETE',
      ipHash: hashIp(getClientIp(req)),
    });
    return NextResponse.json(
      { ok: false, error: 'Permintaan ditolak (origin verification gagal).' },
      { status: 403 }
    );
  }

  const rl = checkRateLimit(rateLimitKey('admin:state', auth.sessionToken), STATE_LIMIT, STATE_WINDOW_MS);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  // REQUEST SIGNING required for state-changing admin ops.
  const rawBody = await req.text();
  const verify = verifySignedRequest(req, rawBody || '', auth.sessionToken);
  if (!verify.ok) {
    securityLog('signature_invalid', 'warn', {
      endpoint: '/api/token/keys/[id]',
      method: 'DELETE',
      reason: verify.reason,
      ipHash: hashIp(getClientIp(req)),
    });
    return unauthorizedGeneric();
  }

  const { id } = await params;
  if (!id || !/^[a-z0-9]{10,40}$/i.test(id)) {
    // Generic — don't reveal whether ID exists
    return NextResponse.json({ ok: false, error: 'Request tidak dapat diproses.' }, { status: 404 });
  }

  try {
    // Use deleteMany so we don't leak whether the ID existed via Prisma's
    // P2025 not-found error.
    const result = await db.apiKey.deleteMany({ where: { id } });
    if (result.count === 0) {
      return NextResponse.json({ ok: false, error: 'Request tidak dapat diproses.' }, { status: 404 });
    }
    securityLog('apikey_deleted', 'info', { id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    securityLog('apikey_delete_error', 'error', {
      id,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json(
      { ok: false, error: 'Request tidak dapat diproses.' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = isAuthed(req);
  if (!auth.ok) {
    securityLog('unauthorized_request', 'warn', {
      endpoint: '/api/token/keys/[id]',
      method: 'PATCH',
      ipHash: hashIp(getClientIp(req)),
    });
    return unauthorizedGeneric();
  }
  if (!checkOrigin(req)) {
    securityLog('csrf_invalid', 'warn', {
      endpoint: '/api/token/keys/[id]',
      method: 'PATCH',
      ipHash: hashIp(getClientIp(req)),
    });
    return NextResponse.json(
      { ok: false, error: 'Permintaan ditolak (origin verification gagal).' },
      { status: 403 }
    );
  }

  const rl = checkRateLimit(rateLimitKey('admin:state', auth.sessionToken), STATE_LIMIT, STATE_WINDOW_MS);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const rawBody = await req.text();
  const verify = verifySignedRequest(req, rawBody || '', auth.sessionToken);
  if (!verify.ok) {
    securityLog('signature_invalid', 'warn', {
      endpoint: '/api/token/keys/[id]',
      method: 'PATCH',
      reason: verify.reason,
      ipHash: hashIp(getClientIp(req)),
    });
    return unauthorizedGeneric();
  }

  const { id } = await params;
  if (!id || !/^[a-z0-9]{10,40}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'Request tidak dapat diproses.' }, { status: 404 });
  }

  try {
    // updateMany returns { count } — if 0, the ID didn't exist (no leak).
    const result = await db.apiKey.updateMany({
      where: { id },
      data: {
        emailCount: 0,
        expired: false,
        expiredAt: null,
        lastUsedAt: null,
        lastEmail: null,
      },
    });
    if (result.count === 0) {
      return NextResponse.json({ ok: false, error: 'Request tidak dapat diproses.' }, { status: 404 });
    }
    securityLog('apikey_reset', 'info', { id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    securityLog('apikey_reset_error', 'error', {
      id,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json(
      { ok: false, error: 'Request tidak dapat diproses.' },
      { status: 500 }
    );
  }
}

// Suppress unused var lint for MAX_EMAILS_PER_KEY (kept for future use).
void MAX_EMAILS_PER_KEY;
