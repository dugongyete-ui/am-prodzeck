import { NextRequest, NextResponse } from 'next/server';
import {
  deleteLocalSession,
  loadLocalSession,
  saveLocalSession,
} from '@/lib/relay/relay';

export async function GET() {
  const session = loadLocalSession();
  return NextResponse.json({ session });
}

export async function POST(req: NextRequest) {
  const session = await req.json().catch(() => null);
  saveLocalSession(session);
  return NextResponse.json({ ok: true, session });
}

export async function DELETE() {
  deleteLocalSession();
  return NextResponse.json({ ok: true, session: null });
}
