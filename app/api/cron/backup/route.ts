import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';

/**
 * Disabled. This endpoint used to read every collection into memory and discard it while
 * reporting "Daily backup completed" — nothing was ever stored. Backups must come from
 * MongoDB Atlas scheduled snapshots or scripts/backup/backup.sh (mongodump to durable storage).
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  console.warn(
    '[Cron] backup: endpoint is disabled. Use MongoDB Atlas snapshots or scripts/backup/backup.sh for backups.'
  );
  return NextResponse.json(
    {
      success: false,
      error: 'Backups are not performed by this endpoint. Use MongoDB Atlas snapshots or scripts/backup/backup.sh.',
    },
    { status: 501 }
  );
}
