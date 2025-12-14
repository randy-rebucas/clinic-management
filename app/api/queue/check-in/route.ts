import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import Room from '@/models/Room';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

/**
 * Check-in using QR code
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();

  // Public endpoint - no authentication required for QR check-in
  // In production, add QR code validation/security

  try {
    await connectDB();
    const body = await request.json();
    const { qrCode } = body;

    if (!qrCode) {
      return NextResponse.json(
        { success: false, error: 'QR code required' },
        { status: 400 }
      );
    }

    // Parse QR code data
    let qrData;
    try {
      qrData = typeof qrCode === 'string' ? JSON.parse(qrCode) : qrCode;
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid QR code format' },
        { status: 400 }
      );
    }

    const { queueId, patientId } = qrData;

    if (!queueId) {
      return NextResponse.json(
        { success: false, error: 'Queue ID not found in QR code' },
        { status: 400 }
      );
    }

    // Get tenant context from headers (public endpoint)
    const tenantContext = await getTenantContext();
    const tenantId = tenantContext.tenantId || undefined;
    
    // Build query with tenant filter
    const query: any = { _id: queueId };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    const doctorPopulateOptions: any = {
      path: 'doctor',
      select: 'firstName lastName',
    };
    if (tenantId) {
      doctorPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      doctorPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }

    // Find queue entry
    const queue = await Queue.findOne(query)
      .populate(patientPopulateOptions)
      .populate(doctorPopulateOptions)
      .populate('room', 'name roomNumber');

    if (!queue) {
      return NextResponse.json(
        { success: false, error: 'Queue entry not found' },
        { status: 404 }
      );
    }

    // Verify patient matches
    if (queue.patient._id.toString() !== patientId) {
      return NextResponse.json(
        { success: false, error: 'QR code does not match queue entry' },
        { status: 403 }
      );
    }

    // Check if already checked in
    if (queue.checkedIn) {
      return NextResponse.json({
        success: true,
        data: queue,
        message: 'Already checked in',
      });
    }

    // Update check-in status
    queue.checkedIn = true;
    queue.checkedInAt = new Date();
    queue.checkInMethod = 'qr_code';
    await queue.save();

    // Log check-in
    await createAuditLog({
      userId: session?.userId || 'public',
      userEmail: session?.email || 'qr_checkin',
      userRole: session?.role || 'public',
      tenantId: tenantId,
      action: 'update',
      resource: 'system',
      resourceId: queue._id,
      description: `Patient checked in via QR code: ${queue.queueNumber}`,
      metadata: {
        checkInMethod: 'qr_code',
      },
    });

    return NextResponse.json({
      success: true,
      data: queue,
      message: 'Checked in successfully',
    });
  } catch (error: any) {
    console.error('Error processing QR check-in:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process check-in' },
      { status: 500 }
    );
  }
}

