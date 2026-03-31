// HEALTH: Health check endpoint for Cloud Run and monitoring.
// Returns 200 with { data: { status: 'healthy' } }.
// This route is public (excluded from auth middleware).

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ data: { status: 'healthy' } });
}
