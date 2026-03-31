// AUTH: Clears the session cookie and redirects to login.
// Supports both GET (link/redirect) and POST (form/fetch).

import { NextRequest, NextResponse } from 'next/server';
import { clearSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  await clearSession();
  const baseUrl = process.env.IDSO_APP_URL || request.url;
  return NextResponse.redirect(new URL('/login', baseUrl));
}

export async function POST(request: NextRequest) {
  await clearSession();
  const baseUrl = process.env.IDSO_APP_URL || request.url;
  return NextResponse.redirect(new URL('/login', baseUrl));
}
