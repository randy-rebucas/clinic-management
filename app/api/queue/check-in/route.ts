import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import '@/models/Room';
import { verifySession } from '@/app/lib/dal';
import { requirePermission } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';
import { isValidId } from '@/lib/api/tenant-session';

/**
 * Queue check-in.
 * - Manual check-in (queueId) is a staff action and requires a session with queue access.
 * - QR check-in (kiosk) may be anonymous but only on the clinic's subdomain, and the QR's
 *   patient id must match the queue entry. Anonymous callers get a minimal response.
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();

  try {
    await connectDB();
    const body = await request.json().catch(() => ({}));
    const { qrCode, queueId: directQueueId } = body ?? {};

    let queueId: unknown;
    let patientId: unknown;
    let checkInMethod: 'qr_code' | 'manual' = 'manual';

    if (qrCode) {
      checkInMethod = 'qr_code';
      let qrData;
      try {
        qrData = typeof qrCode === 'string' ? JSON.parse(qrCode) : qrCode;
      } catch {
        return NextResponse.json(
          { success: false, error: 'Invalid QR code format' },
          { status: 400 }
        );
      }
      queueId = qrData?.queueId;
      patientId = qrData?.patientId;
      if (!isValidId(patientId)) {
        return NextResponse.json({ success: false, error: 'Invalid QR code format' }, { status: 400 });
      }
    } else if (directQueueId) {
      queueId = directQueueId;
    } else {
      return NextResponse.json(
        { success: false, error: 'Queue ID or QR code required' },
        { status: 400 }
      );
    }

    if (!isValidId(queueId)) {
      return NextResponse.json(
        { success: false, error: 'Queue ID not found' },
        { status: 400 }
      );
    }

    // Resolve the clinic: the staff session's clinic, else the subdomain's (kiosk).
    const tenantContext = await getTenantContext();
    let tenantId: string | null = null;
    let isStaff = false;
    if (session?.tenantId && (!tenantContext.tenantId || tenantContext.tenantId === session.tenantId)) {
      const denied = await requirePermission(session, 'queue', 'update');
      if (!denied) {
        tenantId = session.tenantId;
        isStaff = true;
      }
    }
    if (!isStaff) {
      if (checkInMethod === 'manual') {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
      tenantId = tenantContext.tenantId;
    }
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Clinic not found' }, { status: 400 });
    }
    const tenantObjectId = new Types.ObjectId(tenantId);

    const queue = await Queue.findOne({ _id: new Types.ObjectId(queueId), tenantId: tenantObjectId })
      .populate({ path: 'patient', select: 'firstName lastName patientCode', match: { tenantIds: tenantObjectId } })
      .populate({ path: 'doctor', select: 'firstName lastName', match: { tenantId: tenantObjectId } })
      .populate({ path: 'room', select: 'name roomNumber', match: { tenantId: tenantObjectId } });

    if (!queue) {
      return NextResponse.json(
        { success: false, error: 'Queue entry not found' },
        { status: 404 }
      );
    }

    if (patientId) {
      const queuePatientId = queue.patient?._id?.toString() || queue.patient?.toString();
      if (queuePatientId !== patientId) {
        return NextResponse.json(
          { success: false, error: 'QR code does not match queue entry' },
          { status: 403 }
        );
      }
    }

    const respond = (message: string) =>
      NextResponse.json({
        success: true,
        data: isStaff
          ? queue
          : { queueNumber: queue.queueNumber, status: queue.status, checkedIn: queue.checkedIn, checkedInAt: queue.checkedInAt },
        message,
      });

    if (queue.checkedIn) {
      return respond('Already checked in');
    }

    queue.checkedIn = true;
    queue.checkedInAt = new Date();
    queue.checkInMethod = checkInMethod;
    await queue.save();

    await createAuditLog({
      userId: session?.userId || 'public',
      userEmail: session?.email || (checkInMethod === 'qr_code' ? 'qr_checkin' : 'manual_checkin'),
      userRole: session?.role || 'public',
      tenantId: tenantId,
      action: 'update',
      resource: 'system',
      resourceId: queue._id,
      description: `Patient checked in via ${checkInMethod === 'qr_code' ? 'QR code' : 'manual check-in'}: ${queue.queueNumber}`,
      metadata: {
        checkInMethod,
      },
    });

    return respond('Checked in successfully');
  } catch (error: any) {
    console.error('Error processing QR check-in:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process check-in' },
      { status: 500 }
    );
  }
}
