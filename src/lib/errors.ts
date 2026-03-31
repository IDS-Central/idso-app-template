// ERRORS: Standardized API error response helpers.
//
// All API routes should use these helpers to return consistent error shapes:
//   { error: string, status: number }
//
// Usage:
//   import { badRequest, unauthorized, notFound, serverError } from '@/lib/errors';
//   if (!id) return badRequest('Missing id parameter');
//   if (!session) return unauthorized();
//   if (!record) return notFound('Task');
//   try { ... } catch (err) { return serverError(err); }

import { NextResponse } from 'next/server';

/**
 * 400 Bad Request — invalid or missing input from the client.
 */
export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message, status: 400 }, { status: 400 });
}

/**
 * 401 Unauthorized — no valid session or credentials.
 */
export function unauthorized(message = 'Authentication required'): NextResponse {
  return NextResponse.json({ error: message, status: 401 }, { status: 401 });
}

/**
 * 403 Forbidden — authenticated but not allowed to access this resource.
 */
export function forbidden(message = 'Access denied'): NextResponse {
  return NextResponse.json({ error: message, status: 403 }, { status: 403 });
}

/**
 * 404 Not Found — the requested resource does not exist.
 * @param resource - The name of the resource (e.g., "Task", "User")
 */
export function notFound(resource: string): NextResponse {
  return NextResponse.json(
    { error: `${resource} not found`, status: 404 },
    { status: 404 }
  );
}

/**
 * 500 Internal Server Error — unexpected failure.
 * Logs the actual error server-side but returns a generic message to the client.
 */
export function serverError(error: unknown): NextResponse {
  console.error('[ServerError]', error);
  return NextResponse.json(
    { error: 'Internal server error', status: 500 },
    { status: 500 }
  );
}
