import { NextRequest, NextResponse } from 'next/server';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import MobileDevice from '@/models/MobileDevice';
import { Types } from 'mongoose';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import {
  findRefreshTokenSubject,
  readRefreshTokenFromBody,
  revokeRefreshToken,
} from '@/app/lib/refresh-tokens';
import { revokeAllPatientAccess } from '../auth/shared';
import { revokeEmcrAccountSessions, revokePatientToken } from '@/app/lib/dal';

/**
 * GET /api/patients/session: the signed-in patient's basic profile.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionData = await verifyPatientAuth(request, { profile: 'ignore' });

    if (!sessionData) return patientAuthError(request);

    await connectDB();

    // Get patient data
    const patient = await Patient.findById(sessionData.patientId);
    
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found.' },
        { status: 404 }
      );
    }

    if (patient.active === false) {
      await recordPatientRefused(patient as any, request, 'access');
      return NextResponse.json(
        { success: false, error: 'Patient account is inactive. Please contact the clinic.' },
        { status: 403 }
      );
    }

    // Profile only. No app or page reads this route (the app signs out with DELETE and reads
    // records from the /api/patients/me routes, which apply the patient field allowlists and
    // eMCR feature gates); it used to take `?include=` and return records without them.
    const responseData = {
      patient: {
        _id: patient._id,
        patientCode: patient.patientCode,
        firstName: patient.firstName,
        middleName: patient.middleName,
        lastName: patient.lastName,
        suffix: patient.suffix,
        dateOfBirth: patient.dateOfBirth,
        sex: patient.sex,
        email: patient.email,
        phone: patient.phone,
        address: patient.address,
        emergencyContact: patient.emergencyContact,
        allergies: patient.allergies,
        preExistingConditions: patient.preExistingConditions,
      },
    };

    return NextResponse.json({
      success: true,
      data: responseData,
    });

  } catch (error: any) {
    logger.error('Error fetching patient session', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch patient data' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/patients/session[?all=true][&deviceId=...]
 * Sign out. Clears the patient_session cookie and ends the token used for this request (cookie or
 * Bearer); other devices stay signed in unless `all=true`, which revokes every token, cookie, login QR and push registration of this
 * patient ("sign out everywhere"). `deviceId` also unregisters that device from push.
 * Optional JSON body `{ refreshToken }` revokes the app's refresh token. When the access token
 * has expired, a still-valid refresh token in the body identifies the patient instead, so
 * `all` / `deviceId` still work.
 */
export async function DELETE(request: NextRequest) {
  const all = request.nextUrl.searchParams.get('all') === 'true';
  const deviceId = request.nextUrl.searchParams.get('deviceId')?.trim();
  const refreshToken = await readRefreshTokenFromBody(request);

  let patientId: string | null = null;
  // A guardian-only eMCR session is signed in on a record it manages: "everywhere" would sign
  // that person out on their own devices too.
  let guardian = false;
  // The caller's eMCR account: "everywhere" also ends its guardian sessions on records it manages.
  let accountId: string | undefined;
  if (all || deviceId) {
    const session = await verifyPatientAuth(request, { profile: 'ignore', allowPendingPasswordChange: true });
    if (session) {
      patientId = session.patientId;
      guardian = session.rel === 'guardian';
      accountId = session.acc;
    }
  }
  if (all && !patientId && refreshToken) {
    const owner = await findRefreshTokenSubject(refreshToken, 'patient').catch(() => null);
    guardian = owner?.rel === 'guardian';
  }
  if (all && guardian) {
    return NextResponse.json(
      { success: false, code: 'NOT_FOR_FAMILY_PROFILE', error: 'Sign out on this device instead.' },
      { status: 403 }
    );
  }

  if (refreshToken) {
    try {
      // Identify the holder before the token is revoked: it is the proof of identity when the
      // access token has already expired.
      if ((all || deviceId) && !patientId) {
        const owner = await findRefreshTokenSubject(refreshToken, 'patient');
        if (owner) {
          await connectDB();
          const patient = await Patient.findById(owner.subjectId)
            .select('sessionVersion')
            .lean<{ sessionVersion?: number } | null>();
          if (patient && (patient.sessionVersion ?? 0) === owner.sessionVersion) {
            patientId = owner.subjectId;
            accountId = owner.acc;
          }
        }
      }
      await revokeRefreshToken(refreshToken, 'patient');
    } catch (error) {
      logger.error('Error revoking patient refresh token', error as Error);
      return NextResponse.json({ success: false, error: 'Failed to sign out' }, { status: 500 });
    }
  }

  if (all || deviceId) {
    if (!patientId) {
      return NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 });
    }
    try {
      await connectDB();
      if (deviceId) {
        await MobileDevice.updateOne(
          { patientId: new Types.ObjectId(patientId), deviceId },
          { $set: { revokedAt: new Date(), pushToken: null } }
        );
      }
      if (all) {
        await revokeAllPatientAccess(patientId);
        if (accountId) await revokeEmcrAccountSessions(accountId);
      }
    } catch (error) {
      logger.error('Error signing patient out', error as Error);
      return NextResponse.json({ success: false, error: 'Failed to sign out' }, { status: 500 });
    }
  }

  // This device's token stops working now, not when it would have expired.
  try {
    const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    await revokePatientToken(request.cookies.get('patient_session')?.value);
    if (bearer) await revokePatientToken(bearer);
  } catch (error) {
    logger.error('Error revoking patient token on sign-out', error as Error);
  }

  const response = NextResponse.json({
    success: true,
    message: all ? 'Signed out on every device' : 'Logged out successfully',
  });

  // Clear the patient session cookie
  response.cookies.set('patient_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(0),
    path: '/',
  });

  return response;
}

