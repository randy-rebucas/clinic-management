import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import MobileDevice from '@/models/MobileDevice';
import { deleteSession, revokeUserSessions } from '@/app/lib/dal';
import { readRefreshTokenFromBody, revokeRefreshToken } from '@/app/lib/refresh-tokens';
import {
  requireRepSession,
  isRepSessionError,
  repProfileFilter,
  REP_PRIVATE_FIELDS,
} from '../_lib/rep-session';

/**
 * GET /api/medical-representatives/session
 * The signed-in medical representative's profile.
 */
export async function GET(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    await connectDB();

    const medicalRep = await MedicalRepresentative.findOne(repProfileFilter(rep))
      .select(REP_PRIVATE_FIELDS)
      .lean();

    if (!medicalRep) {
      return NextResponse.json(
        { success: false, error: 'Medical representative not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: medicalRep,
    });
  } catch (error: any) {
    console.error('Get medical representative session error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/medical-representatives/session[?all=true][&deviceId=...]
 * Sign out. Clears the session cookie; a Bearer token stays valid until it expires unless
 * `all=true`, which revokes every token and cookie issued to this rep ("sign out everywhere").
 * `deviceId` also unregisters that device from push. Optional JSON body `{ refreshToken }`
 * revokes the app's refresh token (works even after the access token expired).
 */
export async function DELETE(request: NextRequest) {
  try {
    const all = request.nextUrl.searchParams.get('all') === 'true';
    const deviceId = request.nextUrl.searchParams.get('deviceId')?.trim();
    const refreshToken = await readRefreshTokenFromBody(request);
    if (refreshToken) await revokeRefreshToken(refreshToken, 'user');

    if (all || deviceId) {
      const rep = await requireRepSession();
      if (isRepSessionError(rep)) return rep;
      await connectDB();
      if (deviceId) {
        await MobileDevice.updateOne(
          { userId: rep.userObjectId, deviceId },
          { $set: { revokedAt: new Date(), pushToken: null } }
        );
      }
      if (all) await revokeUserSessions(rep.session.userId);
    }

    // deleteSession expires the cookie with its original domain, so a cross-subdomain cookie is removed too.
    await deleteSession();

    return NextResponse.json({
      success: true,
      message: all ? 'Signed out on every device' : 'Logged out successfully',
    });
  } catch (error: any) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
