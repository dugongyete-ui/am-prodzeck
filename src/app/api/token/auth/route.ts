import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, verifyAdminPassword } from '@/lib/token/auth';

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!verifyAdminPassword(password)) {
    return NextResponse.json(
      { ok: false, error: 'Kata sandi salah.' },
      { status: 401 }
    );
  }

  const sessionToken = createSessionToken();
  const res = NextResponse.json({ ok: true, sessionToken });
  // HttpOnly cookie so the session token can't be read by client-side JS.
  res.cookies.set('dzeck_admin', sessionToken, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 4, // 4 hours
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set('dzeck_admin', '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
  return res;
}
