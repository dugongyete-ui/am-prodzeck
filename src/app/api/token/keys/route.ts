import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  ADMIN_WHATSAPP_TEXT,
  ADMIN_WHATSAPP_URL,
  generateApiKey,
  MAX_EMAILS_PER_KEY,
  verifySessionToken,
} from '@/lib/token/auth';

function isAuthed(req: NextRequest): boolean {
  const cookie = req.cookies.get('dzeck_admin')?.value;
  if (verifySessionToken(cookie)) return true;
  // Fallback for explicit header (e.g. curl).
  const header = req.headers.get('x-admin-session');
  if (verifySessionToken(header)) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized.' },
      { status: 401 }
    );
  }

  const keys = await db.apiKey.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return NextResponse.json({
    ok: true,
    keys: keys.map((k) => ({
      id: k.id,
      key: k.key,
      emailCount: k.emailCount,
      maxEmails: MAX_EMAILS_PER_KEY,
      expired: k.expired,
      expiredAt: k.expiredAt,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      lastEmail: k.lastEmail,
      notes: k.notes,
    })),
    whatsappUrl: ADMIN_WHATSAPP_URL,
    whatsappText: ADMIN_WHATSAPP_TEXT,
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized.' },
      { status: 401 }
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const notes = typeof body?.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 200) : null;

  // Throttle creation: max 200 keys total (cheap DoS / runaway protection).
  const count = await db.apiKey.count();
  if (count >= 200) {
    return NextResponse.json(
      { ok: false, error: 'Batas jumlah apikey tercapai. Hapus key lama untuk membuat baru.' },
      { status: 400 }
    );
  }

  const key = generateApiKey();
  const created = await db.apiKey.create({
    data: {
      key,
      notes,
    },
  });

  return NextResponse.json({
    ok: true,
    key: {
      id: created.id,
      key: created.key,
      emailCount: 0,
      maxEmails: MAX_EMAILS_PER_KEY,
      expired: false,
      expiredAt: null,
      createdAt: created.createdAt,
      notes: created.notes,
    },
  });
}
