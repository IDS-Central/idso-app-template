// AUTH: Google OAuth 2.0 authentication module.
//
// All data routes require authentication — do not add unprotected routes.
// This file provides the OAuth2 client, session verification, and domain validation.
//
// Key exports:
//   getOAuth2Client()       — returns a configured OAuth2Client instance
//   requireAuth(request)    — verifies session; returns { email, sub } or { error }
//   getCurrentUser()        — returns current user email or null (for audit fields)
//   getCurrentUserFromRequest(request) — same but from a NextRequest (middleware context)
//   validateHostedDomain(hd) — checks hd claim against IDSO_ALLOWED_DOMAIN
//   isAuthError(result)     — type guard for auth error results
//   unauthorizedResponse()  — returns a 401 JSON NextResponse

import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { getSession, getSessionFromRequest } from './session';

// --- Environment variable validation ---
// Deferred to runtime (not build time) to support Next.js static generation.

let _startupValidated = false;

function validateStartupConfig(): void {
  if (_startupValidated) return;
  _startupValidated = true;

  if (!process.env.SECRET_KEY) {
    throw new Error(
      'FATAL: SECRET_KEY environment variable is required. ' +
      'Generate one with: python3 -c "import secrets; print(secrets.token_hex(32))"'
    );
  }

  if (!process.env.IDSO_OAUTH_CLIENT_ID || !process.env.IDSO_OAUTH_CLIENT_SECRET) {
    if (process.env.IDSO_OAUTH_BYPASS_AUTH !== 'true') {
      throw new Error(
        'FATAL: IDSO_OAUTH_CLIENT_ID and IDSO_OAUTH_CLIENT_SECRET are required. ' +
        'Configure OAuth credentials in GCP Console (APIs & Services > Credentials).'
      );
    }
  }

  if (!process.env.IDSO_ALLOWED_DOMAIN) {
    console.warn(
      '[Auth] WARNING: IDSO_ALLOWED_DOMAIN is not set. ' +
      'Hosted domain (hd) claim will not be validated. ' +
      'Set IDSO_ALLOWED_DOMAIN to restrict login to your Google Workspace org.'
    );
  }
}

// --- OAuth2 client ---

export function getOAuth2Client(): OAuth2Client {
  validateStartupConfig();
  return new OAuth2Client(
    process.env.IDSO_OAUTH_CLIENT_ID,
    process.env.IDSO_OAUTH_CLIENT_SECRET
    // redirect_uri is set dynamically per request
  );
}

// --- Auth result types ---

interface AuthResult {
  email: string;
  sub: string;
}

interface AuthError {
  error: string;
}

export function isAuthError(result: AuthResult | AuthError): result is AuthError {
  return 'error' in result;
}

// --- requireAuth: verify session for API routes ---

export async function requireAuth(request: NextRequest): Promise<AuthResult | AuthError> {
  validateStartupConfig();

  // Local dev bypass
  if (process.env.IDSO_OAUTH_BYPASS_AUTH === 'true') {
    const devEmail = request.headers.get('X-Dev-User-Email') || 'dev@local';
    return { email: devEmail, sub: 'dev' };
  }

  const session = await getSession();
  if (!session) {
    console.warn(`[Auth] Unauthorized access attempt: ${request.method} ${request.nextUrl.pathname}`);
    return { error: 'Authentication required' };
  }

  return { email: session.email, sub: session.email };
}

/**
 * Get the current authenticated user's email from the session.
 * Returns null if not logged in. Use for updated_by audit fields.
 */
export async function getCurrentUser(): Promise<string | null> {
  if (process.env.IDSO_OAUTH_BYPASS_AUTH === 'true') {
    return 'dev@local';
  }
  const session = await getSession();
  return session?.email ?? null;
}

/**
 * Get the current user from a NextRequest (for middleware context).
 * Uses Web Crypto API path since middleware runs in Edge Runtime.
 */
export async function getCurrentUserFromRequest(request: NextRequest): Promise<string | null> {
  if (process.env.IDSO_OAUTH_BYPASS_AUTH === 'true') {
    return request.headers.get('X-Dev-User-Email') || 'dev@local';
  }
  const session = await getSessionFromRequest(request);
  return session?.email ?? null;
}

/**
 * Returns a 401 JSON response for unauthorized API requests.
 */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
}

// --- Domain validation ---

/**
 * Validates the hosted domain (hd) claim from the Google ID token.
 * Defense-in-depth on top of the "Internal" OAuth client setting.
 * If IDSO_ALLOWED_DOMAIN is not set, validation is skipped (with a warning at startup).
 */
export function validateHostedDomain(hd: string | undefined): boolean {
  if (!process.env.IDSO_ALLOWED_DOMAIN) return true;
  return hd === process.env.IDSO_ALLOWED_DOMAIN;
}
