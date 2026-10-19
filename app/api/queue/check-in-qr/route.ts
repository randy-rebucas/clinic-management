import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getSettings } from '@/lib/settings';
import { checkInQr } from '@/lib/clinic-checkin';

/**
 * GET /api/queue/check-in-qr
 * The clinic's current self check-in QR, for a reception tablet or the waiting-room screen.
 * Patients scan it in the eMCR app on arrival (POST /api/patients/me/check-in). The code rotates
 * every 5 minutes; refetch at `expiresAt`.
 * → { enabled, qrImage (PNG data URL), expiresAt } — `enabled: false` (and no image) while the
 *   clinic has app check-in turned off in Settings → Queue.
 *
 * Required permission: queue → read
 */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const denied = await requirePermission(ctx.session, 'queue', 'read');
  if (denied) return denied;

  try {
    const settings = await getSettings(ctx.tenantId);
    if (!settings?.queueSettings?.patientSelfCheckIn) {
      return NextResponse.json({ success: true, data: { enabled: false, qrImage: null, expiresAt: null } });
    }

    const { qrData, expiresAt } = checkInQr(ctx.tenantId);
    const qrImage = await QRCode.toDataURL(qrData, { errorCorrectionLevel: 'M', type: 'image/png', width: 480, margin: 1 });
    return NextResponse.json(
      { success: true, data: { enabled: true, qrImage, expiresAt: expiresAt.toISOString() } },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[GET /api/queue/check-in-qr] Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create the check-in code' }, { status: 500 });
  }
}
