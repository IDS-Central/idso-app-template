// AUTH: OAuth callback handler.
//
// Google redirects here after the user consents. This route:
// 1. Verifies the CSRF state token
// 2. Exchanges the authorization code for tokens
// 3. Verifies the ID token and extracts user info
// 4. Validates the hosted domain (hd) claim
// 5. Creates an encrypted session cookie
// 6. Redirects to home

import { NextRequest, NextResponse } from 'next/server';
import { getOAuth2Client, validateHostedDomain } from '@/lib/auth';
import { buildSessionCookie } from '@/lib/session';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const baseUrl = process.env.IDSO_APP_URL || request.url;

  // Handle OAuth errors (e.g., user denied consent)
  if (error) {
    console.error(`[Auth] OAuth error: ${error}`);
    return NextResponse.redirect(new URL('/login?error=oauth_denied', baseUrl));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', baseUrl));
  }

  // Verify CSRF state
  const storedState = request.cookies.get('oauth_state')?.value;
  if (!state || !storedState || state !== storedState) {
    console.error('[Auth] OAuth state mismatch — possible CSRF attack');
    return NextResponse.redirect(new URL('/login?error=invalid_state', baseUrl));
  }

  try {
    const oauth2Client = getOAuth2Client();
    const redirectUri = new URL('/api/auth/authorize', baseUrl).toString();

    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken({
      code,
      redirect_uri: redirectUri,
    });

    if (!tokens.id_token) {
      console.error('[Auth] No id_token in token response');
      return NextResponse.redirect(new URL('/login?error=no_id_token', baseUrl));
    }

    // Verify the ID token and extract user info
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.IDSO_OAUTH_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      console.error('[Auth] Invalid token payload — missing email');
      return NextResponse.redirect(new URL('/login?error=invalid_token', baseUrl));
    }

    // Validate hosted domain (defense in depth — OAuth client is set to Internal)
    if (!validateHostedDomain(payload.hd)) {
      console.error(
        `[Auth] Domain validation failed: user=${payload.email} hd=${payload.hd} expected=${process.env.IDSO_ALLOWED_DOMAIN}`
      );
      return NextResponse.redirect(new URL('/login?error=domain_not_allowed', baseUrl));
    }

    // Create session cookie
    const sessionCookie = buildSessionCookie({
      email: payload.email,
      name: payload.name || null,
      picture: payload.picture || null,
      hd: payload.hd || null,
      loggedInAt: Date.now(),
    });

    // Clear the CSRF state cookie and redirect to home
    const response = NextResponse.redirect(new URL('/', baseUrl));
    response.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.options);
    response.cookies.delete('oauth_state');
    console.log(`[Auth] Login successful for ${payload.email}`);
    return response;
  } catch (err) {
    console.error('[Auth] Token exchange failed:', err);
    return NextResponse.redirect(new URL('/login?error=token_exchange_failed', baseUrl));
  }
}
