import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { MAX_EMAILS_PER_KEY, verifySessionToken } from '@/lib/token/auth';

function isAuthed(req: NextRequest): boolean {
  const cookie = req.cookies.get('dzeck_admin')?.value;
  if (verifySessionToken(cookie)) return true;
  const header = req.headers.get('x-admin-session');
  if (verifySessionToken(header)) return true;
  return false;
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: 'ID tidak valid.' }, { status: 400 });
  }
  try {
    await db.apiKey.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'Apikey tidak ditemukan.' }, { status: 404 });
  }
}

// POST /[id]/reset — reset the key's usage counter (un-expire it).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: 'ID tidak valid.' }, { status: 400 });
  }
  try {
    const updated = await db.apiKey.update({
      where: { id },
      data: {
        emailCount: 0,
        expired: false,
        expiredAt: null,
        lastUsedAt: null,
        lastEmail: null,
      },
    });
    return NextResponse.json({
      ok: true,
      key: {
        id: updated.id,
        key: updated.key,
        emailCount: updated.emailCount,
        maxEmails: MAX_EMAILS_PER_KEY,
        expired: updated.expired,
        expiredAt: updated.expiredAt,
        createdAt: updated.createdAt,
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Apikey tidak ditemukan.' }, { status: 404 });
  }
}
