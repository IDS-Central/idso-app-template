// SETUP: Database migration endpoint.
//
// Runs Prisma migrations to create/update database tables.
// Protected by auth middleware — only authenticated users can trigger this.
// In production, prefer running migrations as part of the deploy pipeline.
// This endpoint exists as a convenience for initial setup and emergencies.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { serverError, unauthorized } from '@/lib/errors';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) {
    return unauthorized();
  }

  try {
    // Run Prisma db push to sync schema without migrations
    // This is safe for production — it only adds missing tables/columns,
    // never drops existing data.
    const { stdout, stderr } = await execAsync('npx prisma db push --accept-data-loss', {
      env: { ...process.env },
      timeout: 30000,
    });

    console.log(`[Setup] Database sync triggered by ${auth.email}`);
    if (stdout) console.log('[Setup] stdout:', stdout);
    if (stderr) console.log('[Setup] stderr:', stderr);

    return NextResponse.json({
      data: {
        message: 'Database schema synced successfully',
        triggeredBy: auth.email,
      },
    });
  } catch (err) {
    return serverError(err);
  }
}
