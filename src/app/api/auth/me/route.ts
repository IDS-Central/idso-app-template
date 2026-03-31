// AUTH: Returns the current user's profile from the session.
// Used by AuthProvider on the client to check login status.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, unauthorizedResponse } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) {
    return unauthorizedResponse();
  }
  return NextResponse.json({ data: { email: auth.email } });
}
