import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import MobileDevice from '@/models/MobileDevice';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';

/**
 * POST /api/patients/me/devices
 * Registers (or updates) the calling patient's mobile device for push
 * delivery. Called on app launch / after login and whenever the Expo push
 * token rotates.
 *
 * Body: { deviceId, platform: 'ios' | 'android', pushToken?, appVersion? }
 */
export async function POST(request: NextRequest) {
  const session = await verifyPatientAuth(request);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 });
  }

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
  }

  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
  const platform = body.platform === 'ios' || body.platform === 'android' ? body.platform : null;
  const pushToken = typeof body.pushToken === 'string' ? body.pushToken.trim() : undefined;
  const appVersion = typeof body.appVersion === 'string' ? body.appVersion.trim() : undefined;

  if (!deviceId || !platform) {
    return NextResponse.json(
      { success: false, error: 'deviceId and platform ("ios" | "android") are required' },
      { status: 400 }
    );
  }

  try {
    await connectDB();

    const device = await MobileDevice.findOneAndUpdate(
      { patientId: new Types.ObjectId(session.patientId), deviceId },
      {
        $set: {
          platform,
          pushToken,
          appVersion,
          lastSeenAt: new Date(),
          revokedAt: null,
        },
        $setOnInsert: {
          patientId: new Types.ObjectId(session.patientId),
          deviceId,
        },
      },
      { upsert: true, new: true, runValidators: true }
    ).lean();

    logger.info('Patient mobile device registered', { patientId: session.patientId, deviceId, platform });

    return NextResponse.json({ success: true, data: device });
  } catch (error) {
    logger.error('Error registering patient mobile device', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to register device' }, { status: 500 });
  }
}

/**
 * DELETE /api/patients/me/devices?deviceId=...
 * Unregisters a device — used for "log out this device" / app uninstall
 * cleanup. Marks the device revoked rather than deleting, to retain the
 * audit trail of what was ever registered.
 */
export async function DELETE(request: NextRequest) {
  const session = await verifyPatientAuth(request);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 });
  }

  const deviceId = request.nextUrl.searchParams.get('deviceId')?.trim();
  if (!deviceId) {
    return NextResponse.json({ success: false, error: 'deviceId query parameter is required' }, { status: 400 });
  }

  try {
    await connectDB();

    const result = await MobileDevice.updateOne(
      { patientId: new Types.ObjectId(session.patientId), deviceId },
      { $set: { revokedAt: new Date(), pushToken: null } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ success: false, error: 'Device not found' }, { status: 404 });
    }

    logger.info('Patient mobile device revoked', { patientId: session.patientId, deviceId });

    return NextResponse.json({ success: true, message: 'Device unregistered' });
  } catch (error) {
    logger.error('Error revoking patient mobile device', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to unregister device' }, { status: 500 });
  }
}
