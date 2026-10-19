import { NextRequest, NextResponse } from 'next/server';
import { verifyPatientSession, PatientSessionPayload } from '@/app/lib/dal';
import { canActFor } from '@/lib/patient-family';

/** Header the app sends to act for a family member (their record id). */
export const PATIENT_PROFILE_HEADER = 'x-patient-profile';

/**
 * What a route does with `X-Patient-Profile` (family accounts, lib/patient-family.ts):
 * - 'allow' (default): answer for the family member: `patientId` becomes theirs and
 *   `guardianId` holds the signed-in record.
 * - 'ignore': always the signed-in person (devices, sign-out, the family list itself).
 * - 'refuse': 403 `NOT_FOR_FAMILY_PROFILE` when the header is sent (credentials, login QR).
 */
export type ProfileMode = 'allow' | 'ignore' | 'refuse';

/**
 * Verify the patient identity from either:
 *   1. The patient_session HttpOnly cookie  (web portal / same-origin requests)
 *   2. Authorization: Bearer <token> header  (third-party apps, mobile apps)
 *
 * Both carriers use the same HS256 JWT format signed with SESSION_SECRET,
 * so no separate token type is needed.
 *
 * Usage (replaces the two-line cookie pattern in every patient API route):
 *
 *   const session = await verifyPatientAuth(request);
 *   if (!session) return patientAuthError(request);
 *
 * A family profile the caller may not manage (never linked, unlinked, or a phone link that lapsed
 * at 18) also gives null; patientAuthError then answers 403 rather than 401, so the app keeps the
 * session and falls back to the signed-in person. Routes with `profile: 'refuse'` do the same for
 * any header.
 */
export async function verifyPatientAuth(
  request: NextRequest,
  options: { profile?: ProfileMode } = {}
): Promise<PatientSessionPayload | null> {
  const session = await signedInSession(request);
  if (!session) return null;

  const mode = options.profile ?? 'allow';
  const profileId = request.headers.get(PATIENT_PROFILE_HEADER)?.trim();
  if (!profileId || profileId === session.patientId || mode === 'ignore') return session;
  if (mode === 'refuse') {
    profileFailures.set(request, 'refused');
    return null;
  }

  if (!(await canActFor(session.patientId, profileId))) {
    profileFailures.set(request, 'forbidden');
    return null;
  }
  // The family member's view, inside the caller's clinic scope. Never a fresh-OTP proof: the
  // caller proved their own phone, not the family member's.
  const { amr: _amr, ...rest } = session;
  return { ...rest, patientId: profileId, guardianId: session.patientId };
}

/** Why verifyPatientAuth refused a signed-in caller because of their family-profile header. */
const profileFailures = new WeakMap<NextRequest, 'refused' | 'forbidden'>();

/**
 * The response for a null verifyPatientAuth: 401 when the caller isn't signed in (the app
 * refreshes or signs in again), 403 when only the family profile was the problem (the app keeps
 * the session and switches back to the signed-in person).
 */
export function patientAuthError(request: NextRequest): NextResponse {
  const failure = profileFailures.get(request);
  if (failure === 'refused') {
    return NextResponse.json(
      { success: false, code: 'NOT_FOR_FAMILY_PROFILE', error: 'Switch back to your own profile to do this.' },
      { status: 403 }
    );
  }
  if (failure === 'forbidden') {
    return NextResponse.json(
      { success: false, code: 'PROFILE_FORBIDDEN', error: 'You no longer manage this family member’s records.' },
      { status: 403 }
    );
  }
  return NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 });
}

async function signedInSession(request: NextRequest): Promise<PatientSessionPayload | null> {
  // 1. Cookie (browser / web portal)
  const cookieValue = request.cookies.get('patient_session')?.value;
  if (cookieValue) {
    const session = await verifyPatientSession(cookieValue);
    if (session) return session;
  }

  // 2. Bearer token (third-party apps)
  const authHeader = request.headers.get('authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return verifyPatientSession(token);
  }

  return null;
}

export type { PatientSessionPayload };
