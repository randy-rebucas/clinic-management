import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MobileDevice from '@/models/MobileDevice';
import logger from '@/lib/logger';
import { requireRepSession, isRepSessionError } from '../_lib/rep-session';

/**
 * POST /api/medical-representatives/devices
 * Registers (or updates) the signed-in rep's mobile device for push delivery. Call after
 * sign-in and whenever the Expo push token rotates.
 *
 * Body: { deviceId, platform: 'ios' | 'android', pushToken?, appVersion? }
 */
export async function POST(request: NextRequest) {
  const rep = await requireRepSession();
  if (isRepSessionError(rep)) return rep;

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
  }

  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim().slice(0, 200) : '';
  const platform = body.platform === 'ios' || body.platform === 'android' ? body.platform : null;
  const pushToken = typeof body.pushToken === 'string' ? body.pushToken.trim().slice(0, 500) : undefined;
  const appVersion = typeof body.appVersion === 'string' ? body.appVersion.trim().slice(0, 50) : undefined;

  if (!deviceId || !platform) {
    return NextResponse.json(
      { success: false, error: 'deviceId and platform ("ios" | "android") are required' },
      { status: 400 }
    );
  }

  try {
    await connectDB();

    // A device is signed in to one account at a time: drop any other user's registration of it
    // so pushes stop going to the previous account.
    await MobileDevice.deleteMany({
      deviceId,
      patientId: { $exists: false },
      userId: { $ne: rep.userObjectId },
    });

    const device = await MobileDevice.findOneAndUpdate(
      { userId: rep.userObjectId, deviceId },
      {
        $set: {
          platform,
          pushToken,
          appVersion,
          lastSeenAt: new Date(),
          revokedAt: null,
        },
        $setOnInsert: {
          userId: rep.userObjectId,
          deviceId,
          ...(rep.ownerFilter.tenantId ? { tenantId: rep.ownerFilter.tenantId } : {}),
        },
      },
      { upsert: true, new: true, runValidators: true }
    ).lean();

    logger.info('Medical representative mobile device registered', { userId: rep.session.userId, deviceId, platform });

    return NextResponse.json({ success: true, data: device });
  } catch (error) {
    logger.error('Error registering medical representative mobile device', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to register device' }, { status: 500 });
  }
}

/**
 * DELETE /api/medical-representatives/devices?deviceId=...
 * Unregisters a device from push (sign-out on that device, uninstall cleanup).
 */
export async function DELETE(request: NextRequest) {
  const rep = await requireRepSession();
  if (isRepSessionError(rep)) return rep;

  const deviceId = request.nextUrl.searchParams.get('deviceId')?.trim();
  if (!deviceId) {
    return NextResponse.json({ success: false, error: 'deviceId query parameter is required' }, { status: 400 });
  }

  try {
    await connectDB();

    const result = await MobileDevice.updateOne(
      { userId: rep.userObjectId, deviceId },
      { $set: { revokedAt: new Date(), pushToken: null } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ success: false, error: 'Device not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Device unregistered' });
  } catch (error) {
    logger.error('Error revoking medical representative mobile device', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to unregister device' }, { status: 500 });
  }
}
