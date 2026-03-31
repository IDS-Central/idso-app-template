// AUTH MIDDLEWARE: Enforces authentication on all routes.
//
// Runs in Next.js Edge Runtime (uses Web Crypto API, not Node.js crypto).
// Public routes are explicitly listed — everything else requires a valid session.
//
// Behavior:
//   - Public routes pass through immediately
//   - Static assets and Next.js internals pass through
//   - Dev bypass mode (IDSO_OAUTH_BYPASS_AUTH=true) passes everything through
//   - API requests without session get 401 JSON
//   - Browser requests without session get redirected to /login

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';

// Routes that do NOT require authentication.
// Add app-specific public routes here if needed (e.g., webhook endpoints).
const PUBLIC_ROUTES = new Set([
  '/login',
  '/api/auth/login',
  '/api/auth/authorize',
  '/api/auth/logout',
  '/api/health',
  '/api/setup',
]);

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.has(pathname);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.js')
  ) {
    return NextResponse.next();
  }

  // Local dev bypass
  if (process.env.IDSO_OAUTH_BYPASS_AUTH === 'true') {
    return NextResponse.next();
  }

  // Check session
  const session = await getSessionFromRequest(request);

  if (!session) {
    // API requests get 401 JSON; browser requests get redirected to /login
    const accept = request.headers.get('Accept') || '';
    const isXHR = request.headers.get('X-Requested-With') === 'XMLHttpRequest';
    const isAPIRoute = pathname.startsWith('/api/');
    const isAPIRequest = isAPIRoute || accept.includes('application/json') || isXHR;

    if (isAPIRequest) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    console.warn(`[Auth] Unauthorized access attempt: ${request.method} ${pathname}`);
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static files
    '/((?!_next/static|_next/image).*)',
  ],
};
