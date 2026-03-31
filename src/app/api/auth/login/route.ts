// AUTH: Initiates the Google OAuth 2.0 flow.
//
// 1. If already authenticated, redirects to home
// 2. In dev bypass mode, creates a dev session and redirects to home
// 3. Otherwise, generates a CSRF state token, stores it in a cookie,
//    and redirects to Google's OAuth consent screen

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getOAuth2Client } from '@/lib/auth';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  const baseUrl = process.env.IDSO_APP_URL || request.url;

  // If already authenticated, redirect to home
  const session = await getSession();
  if (session) {
    return NextResponse.redirect(new URL('/', baseUrl));
  }

  // Local dev bypass — create a dev session immediately
  if (process.env.IDSO_OAUTH_BYPASS_AUTH === 'true') {
    const { buildSessionCookie } = await import('@/lib/session');
    const sessionCookie = buildSessionCookie({
      email: 'dev@local',
      name: 'Dev User',
      picture: null,
      hd: null,
      loggedInAt: Date.now(),
    });
    const response = NextResponse.redirect(new URL('/', baseUrl));
    response.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.options);
    return response;
  }

  const oauth2Client = getOAuth2Client();
  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = new URL('/api/auth/authorize', baseUrl).toString();

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    redirect_uri: redirectUri,
    state,
    prompt: 'select_account',
  });

  // Store state in a short-lived cookie for CSRF protection
  const response = NextResponse.redirect(authUrl);
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 300, // 5 minutes
    path: '/',
  });

  return response;
}
