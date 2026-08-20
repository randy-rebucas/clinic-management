import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { createAuditLog } from '@/lib/audit';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getQueueById, updateQueueEntry } from '@/lib/data/queue';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

/**
 * Check-in using QR code
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();

  // Public endpoint - no authentication required for QR check-in
  // In production, add QR code validation/security

  try {
    const body = await request.json();
    const { qrCode, queueId: directQueueId } = body;

    let queueId: string;
    let patientId: string | undefined;
    let checkInMethod: 'qr_code' | 'manual' = 'manual';

    if (qrCode) {
      checkInMethod = 'qr_code';
      let qrData;
      try {
        qrData = typeof qrCode === 'string' ? JSON.parse(qrCode) : qrCode;
      } catch (error) {
        return NextResponse.json({ success: false, error: 'Invalid QR code format' }, { status: 400 });
      }
      queueId = qrData.queueId;
      patientId = qrData.patientId;
    } else if (directQueueId) {
      queueId = directQueueId;
    } else {
      return NextResponse.json({ success: false, error: 'Queue ID or QR code required' }, { status: 400 });
    }

    if (!queueId) {
      return NextResponse.json({ success: false, error: 'Queue ID not found' }, { status: 400 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = tenantContext.tenantId;

    const queue = await run(tenantId, () => getQueueById(queueId));

    if (!queue) {
      return NextResponse.json({ success: false, error: 'Queue entry not found' }, { status: 404 });
    }

    // Verify patient matches (only for QR code check-in)
    if (patientId) {
      const queuePatientId = typeof queue.patient === 'string' ? queue.patient : queue.patient?.id;
      if (queuePatientId !== patientId) {
        return NextResponse.json({ success: false, error: 'QR code does not match queue entry' }, { status: 403 });
      }
    }

    if (queue.checkedIn) {
      return NextResponse.json({ success: true, data: queue, message: 'Already checked in' });
    }

    const updated = await run(tenantId, () =>
      updateQueueEntry(queueId, {
        checkedIn: true,
        checkedInAt: new Date(),
        checkInMethod,
      })
    );

    // Log check-in. OUT OF SCOPE — lib/audit.ts is now Prisma-backed (Batch
    // 6), this call needs no changes.
    await createAuditLog({
      userId: session?.userId || 'public',
      userEmail: session?.email || (checkInMethod === 'qr_code' ? 'qr_checkin' : 'manual_checkin'),
      userRole: session?.role || 'public',
      tenantId: tenantId || undefined,
      action: 'update',
      resource: 'system',
      resourceId: updated.id,
      description: `Patient checked in via ${checkInMethod === 'qr_code' ? 'QR code' : 'manual check-in'}: ${updated.queueNumber}`,
      metadata: { checkInMethod },
    });

    return NextResponse.json({ success: true, data: updated, message: 'Checked in successfully' });
  } catch (error: any) {
    console.error('Error processing QR check-in:', error);
    return NextResponse.json({ success: false, error: 'Failed to process check-in' }, { status: 500 });
  }
}
