import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import MobileDevice, { PUSH_CATEGORIES, PushCategory } from '@/models/MobileDevice';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';

type PushPrefs = Record<PushCategory, boolean>;

/** Every category, with unset ones reported as on (the send-time default). */
function normalize(prefs: Partial<PushPrefs> | undefined): PushPrefs {
  return Object.fromEntries(PUSH_CATEGORIES.map((c) => [c, prefs?.[c] !== false])) as PushPrefs;
}

/**
 * GET /api/patients/me/devices/preferences?deviceId=...
 * Which push categories this device receives. Unset categories are on.
 *
 * Response data: { appointments, labResults, queue, messages, billing, prescriptions, followUps } (booleans)
 */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request, { profile: 'ignore' });
  if (!session) return patientAuthError(request);

  const deviceId = request.nextUrl.searchParams.get('deviceId')?.trim();
  if (!deviceId) {
    return NextResponse.json({ success: false, error: 'deviceId query parameter is required' }, { status: 400 });
  }

  try {
    await connectDB();
    const device = await MobileDevice.findOne({
      patientId: new Types.ObjectId(session.patientId),
      deviceId,
      revokedAt: null,
    })
      .select('pushPrefs')
      .lean<{ pushPrefs?: Partial<PushPrefs> } | null>();

    if (!device) {
      return NextResponse.json({ success: false, error: 'Device not found', code: 'DEVICE_NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: normalize(device.pushPrefs) });
  } catch (error) {
    logger.error('Error reading patient push preferences', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to load notification settings' }, { status: 500 });
  }
}

/**
 * PATCH /api/patients/me/devices/preferences
 * Turns push categories on or off for one device. Only the categories sent change.
 * The device must already be registered (POST /api/patients/me/devices).
 *
 * Body: { deviceId, appointments?, labResults?, queue?, messages?, billing?, prescriptions?, followUps? } (booleans)
 * Response data: the full preferences after the change.
 */
export async function PATCH(request: NextRequest) {
  const session = await verifyPatientAuth(request, { profile: 'ignore' });
  if (!session) return patientAuthError(request);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
  }

  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim().slice(0, 200) : '';
  if (!deviceId) {
    return NextResponse.json({ success: false, error: 'deviceId is required' }, { status: 400 });
  }

  const set: Record<string, boolean> = {};
  for (const category of PUSH_CATEGORIES) {
    const value = body[category];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') {
      return NextResponse.json({ success: false, error: `${category} must be true or false` }, { status: 400 });
    }
    set[`pushPrefs.${category}`] = value;
  }
  if (!Object.keys(set).length) {
    return NextResponse.json(
      { success: false, error: `Send at least one of: ${PUSH_CATEGORIES.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    await connectDB();
    const device = await MobileDevice.findOneAndUpdate(
      { patientId: new Types.ObjectId(session.patientId), deviceId, revokedAt: null },
      { $set: set },
      { new: true }
    )
      .select('pushPrefs')
      .lean<{ pushPrefs?: Partial<PushPrefs> } | null>();

    if (!device) {
      return NextResponse.json({ success: false, error: 'Device not found', code: 'DEVICE_NOT_FOUND' }, { status: 404 });
    }

    logger.info('Patient push preferences updated', { patientId: session.patientId, deviceId, ...set });
    return NextResponse.json({ success: true, data: normalize(device.pushPrefs) });
  } catch (error) {
    logger.error('Error updating patient push preferences', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to save notification settings' }, { status: 500 });
  }
}
