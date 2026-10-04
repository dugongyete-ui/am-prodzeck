import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { MAX_EMAILS_PER_KEY, verifySessionToken } from '@/lib/token/auth';
import {
  checkOrigin,
  hashApiKey,
  tooManyRequests,
  unauthorizedGeneric,
  verifySignedRequest,
} from '@/lib/security/session-cookie';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import { getClientIp, hashIp } from '@/lib/security/ip';
import { securityLog } from '@/lib/security/security-log';
import { generateApiKey } from '@/lib/token/auth';

// All admin endpoints are rate-limited per (admin session, IP).
const LIST_LIMIT = 60; // per hour
const LIST_WINDOW_MS = 60 * 60 * 1000;
const CREATE_LIMIT = 20; // per hour
const CREATE_WINDOW_MS = 60 * 60 * 1000;

// Pagination cap. Client may request less, never more.
const MAX_PAGE_SIZE = 50;

function isAuthed(req: NextRequest): { ok: true; sessionToken: string } | { ok: false } {
  // Prefer cookie-based session (browser flow).
  const cookie = req.cookies.get('dzeck_admin')?.value;
  if (cookie && verifySessionToken(cookie)) {
    return { ok: true, sessionToken: cookie };
  }
  // Allow header-based for curl/automation (still must be a valid signed
  // session token issued by /api/token/auth).
  const header = req.headers.get('x-admin-session');
  if (header && verifySessionToken(header)) {
    return { ok: true, sessionToken: header };
  }
  return { ok: false };
}

export async function GET(req: NextRequest) {
  const auth = isAuthed(req);
  if (!auth.ok) {
    securityLog('unauthorized_request', 'warn', {
      endpoint: '/api/token/keys',
      method: 'GET',
      ipHash: hashIp(getClientIp(req)),
    });
    return unauthorizedGeneric();
  }

  // Rate limit per admin session.
  const rl = checkRateLimit(
    rateLimitKey('admin:list', auth.sessionToken),
    LIST_LIMIT,
    LIST_WINDOW_MS
  );
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  // Cursor pagination: ?cursor=<createdAtIso>&limit=<1..50>
  const url = new URL(req.url);
  const limitParam = parseInt(url.searchParams.get('limit') || '20', 10);
  const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, isNaN(limitParam) ? 20 : limitParam));
  const cursorParam = url.searchParams.get('cursor');

  // Pagination-abuse detection: if client asks for a suspiciously large
  // limit, log it. (We already clamp, so this is just an audit signal.)
  if (limitParam > MAX_PAGE_SIZE) {
    securityLog('pagination_abuse', 'warn', {
      endpoint: '/api/token/keys',
      requestedLimit: limitParam,
      clampedTo: MAX_PAGE_SIZE,
      ipHash: hashIp(getClientIp(req)),
    });
  }

  // Query ordered by createdAt DESC. Cursor-based: skip until createdAt <
  // cursorParam (older than cursor). We can't use Prisma cursor directly
  // because we ordered by a non-unique field; emulate with where.
  let keys;
  if (cursorParam) {
    const cursorDate = new Date(cursorParam);
    if (isNaN(cursorDate.getTime())) {
      return NextResponse.json(
        { ok: false, error: 'Cursor tidak valid.' },
        { status: 400 }
      );
    }
    keys = await db.apiKey.findMany({
      where: { createdAt: { lt: cursorDate } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
  } else {
    keys = await db.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
  }

  const hasMore = keys.length > limit;
  const items = keys.slice(0, limit);
  const nextCursor =
    hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;

  // RESPONSE MINIMIZATION: only return fields the admin UI actually needs.
  // Don't leak: id (internal cuid), createdIpHash, lastSendResponse, etc.
  return NextResponse.json({
    ok: true,
    keys: items.map((k) => ({
      id: k.id,
      keyMasked: maskApiKeyFromHash(k.keyPrefix),
      keyPrefix: k.keyPrefix,
      emailCount: k.emailCount,
      maxEmails: k.maxEmails || MAX_EMAILS_PER_KEY,
      expired: k.expired,
      expiredAt: k.expiredAt,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      lastEmail: k.lastEmail,
      notes: k.notes,
    })),
    nextCursor,
    hasMore,
  });
}

function maskApiKeyFromHash(prefix: string): string {
  // Show: dzk_<prefix>…
  if (!prefix) return '***';
  return `dzk_${prefix}…`;
}

export async function POST(req: NextRequest) {
  const auth = isAuthed(req);
  if (!auth.ok) {
    securityLog('unauthorized_request', 'warn', {
      endpoint: '/api/token/keys',
      method: 'POST',
      ipHash: hashIp(getClientIp(req)),
    });
    return unauthorizedGeneric();
  }

  // CSRF check (defense-in-depth on top of cookie SameSite=strict).
  if (!checkOrigin(req)) {
    securityLog('csrf_invalid', 'warn', {
      endpoint: '/api/token/keys',
      method: 'POST',
      ipHash: hashIp(getClientIp(req)),
    });
    return NextResponse.json(
      { ok: false, error: 'Permintaan ditolak (origin verification gagal).' },
      { status: 403 }
    );
  }

  // Rate limit per admin session.
  const rl = checkRateLimit(
    rateLimitKey('admin:create', auth.sessionToken),
    CREATE_LIMIT,
    CREATE_WINDOW_MS
  );
  if (!rl.allowed) {
    securityLog('rate_limit_hit', 'warn', {
      endpoint: '/api/token/keys',
      method: 'POST',
      limit: CREATE_LIMIT,
      retryAfterSec: rl.retryAfterSec,
    });
    return tooManyRequests(rl.retryAfterSec);
  }

  // REQUEST SIGNING: required for state-changing admin operations.
  // Read raw body for signature verification (we'll re-parse to JSON after).
  const rawBody = await req.text();
  const verify = verifySignedRequest(req, rawBody, auth.sessionToken);
  if (!verify.ok) {
    securityLog('signature_invalid', 'warn', {
      endpoint: '/api/token/keys',
      method: 'POST',
      reason: verify.reason,
      ipHash: hashIp(getClientIp(req)),
    });
    return unauthorizedGeneric();
  }

  // Parse body AFTER signature verification.
  let body: any = {};
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = {};
  }
  const notes =
    typeof body?.notes === 'string' && body.notes.trim()
      ? body.notes.trim().slice(0, 200)
      : null;

  // Throttle: max 200 keys total (cheap runaway protection).
  const count = await db.apiKey.count();
  if (count >= 200) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Batas jumlah apikey tercapai. Hapus key lama untuk membuat baru.',
      },
      { status: 400 }
    );
  }

  const ip = getClientIp(req);
  const ipHash = hashIp(ip);

  // Generate new key in the format `dzk_<8hex>_<24hex>` = 39 chars.
  const { key, prefix } = generateApiKeyWithPrefix();
  const keyHash = hashApiKey(key);

  const created = await db.apiKey.create({
    data: {
      keyPrefix: prefix,
      keyHash,
      maxEmails: MAX_EMAILS_PER_KEY,
      notes,
      createdIpHash: ipHash,
    },
  });

  securityLog('apikey_created', 'info', {
    keyPrefix: prefix,
    ipHash,
    id: created.id,
  });

  // RESPONSE MINIMIZATION: return the FULL plaintext key ONCE on creation
  // (so admin can copy and share via WhatsApp). After this, only the masked
  // form is returned by GET.
  return NextResponse.json({
    ok: true,
    key: {
      id: created.id,
      key, // PLAINTEXT — only returned here, never again
      keyPrefix: prefix,
      emailCount: 0,
      maxEmails: MAX_EMAILS_PER_KEY,
      expired: false,
      expiredAt: null,
      createdAt: created.createdAt,
      notes: created.notes,
    },
    // Tell admin explicitly that this key won't be shown again.
    warning: 'Simpan key ini segera. Setelah ini hanya tampil sebagai dzk_xxx…',
  });
}

// Generate a new apikey with explicit prefix split-out. Format:
//   dzk_<8 hex>_<24 hex>     (39 chars total)
// The first 8 hex chars after `dzk_` are non-secret (used for DB lookup).
// The remaining 24 hex chars are the secret (compared via sha256 hash).
function generateApiKeyWithPrefix(): { key: string; prefix: string } {
  const secret = generateApiKey(); // returns dzk_<32hex>
  // Strip dzk_ prefix to get 32 hex chars, split into 8 + 24.
  const rest = secret.slice(4); // 32 hex chars
  const prefix = rest.slice(0, 8);
  // Reassemble with explicit separator for human readability.
  const key = `dzk_${prefix}_${rest.slice(8)}`;
  return { key, prefix };
}
