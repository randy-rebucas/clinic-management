import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { checkPhoto, MAX_PHOTO_BODY_BYTES } from '@/lib/patient-photo';
import { isMinor } from '@/lib/patient-family';
import { rateLimit } from '@/lib/middleware/rate-limit';

const bad = (error: string, status = 400, code?: string) =>
  NextResponse.json({ success: false, error, ...(code ? { code } : {}) }, { status });

/** Picture uploads per patient record, across devices and IPs: 10 an hour. */
const photoLimiter = rateLimit({
  name: 'patient-photo',
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
  identifierOnly: true,
  message: 'You’ve changed your picture several times already. Please try again later.',
});

/**
 * Only an active record may change its picture. Follows the family-profile header like the rest of
 * /me, so a guardian can set the picture of a child they manage.
 */
async function setPhoto(patientId: string, value: string | null) {
  const update = value === null ? { $unset: { profileImage: 1 } } : { $set: { profileImage: value } };
  return Patient.updateOne({ _id: patientId, active: { $ne: false } }, update);
}

type PhotoSession = NonNullable<Awaited<ReturnType<typeof verifyPatientAuth>>>;

/**
 * A picture is the person's own: someone acting for another record (the family-profile header, or
 * a guardian-only eMCR session) may set or remove it only while that person is a minor. Family
 * links also cover adults (a staff link for an elderly parent, consented to at one clinic's desk
 * for their records there), and those don't extend to the adult's own face on their account.
 * Null when allowed, else the 403 response.
 */
async function refuseForAdultFamilyMember(session: PhotoSession): Promise<NextResponse | null> {
  if (!session.guardianId && session.rel !== 'guardian') return null;
  const record = await Patient.findById(session.patientId).select('dateOfBirth').lean<{ dateOfBirth?: Date } | null>();
  if (record && isMinor(record.dateOfBirth)) return null;
  return bad('Only they can change their own picture.', 403, 'PHOTO_SELF_ONLY');
}

/**
 * PUT /api/patients/me/photo  { image: "data:image/jpeg;base64,…" }
 * Sets the patient's picture. 429 after 10 in an hour for one record. 403 `PHOTO_SELF_ONLY`
 * when acting for an adult family member.
 */
export async function PUT(request: NextRequest) {
  const session = await verifyPatientAuth(request);
  if (!session) return patientAuthError(request);

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_PHOTO_BODY_BYTES) return bad('The picture must be 300 KB or smaller.', 413);

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_PHOTO_BODY_BYTES) return bad('The picture must be 300 KB or smaller.', 413);
    body = JSON.parse(text);
  } catch {
    return bad('Invalid request format');
  }
  const image = body && typeof body === 'object' && !Array.isArray(body) ? (body as { image?: unknown }).image : undefined;
  const checked = checkPhoto(image);
  if (!checked.ok) return bad(checked.error);

  try {
    await connectDB();
    const refused = await refuseForAdultFamilyMember(session);
    if (refused) return refused;
    const limited = await photoLimiter(request, `patient-photo:${session.patientId}`);
    if (limited) return limited;
    const result = await setPhoto(session.patientId, checked.dataUri);
    if (result.matchedCount === 0) return bad('Account is inactive. Please contact the clinic.', 403);
    logger.info('Patient set profile picture', { patientId: session.patientId });
    return NextResponse.json({ success: true, data: { profileImage: checked.dataUri } });
  } catch (error) {
    logger.error('Error saving patient profile picture', error as Error);
    return bad('Failed to save the picture', 500);
  }
}

/**
 * DELETE /api/patients/me/photo
 * Removes the patient's picture (the app falls back to initials). 403 `PHOTO_SELF_ONLY` as PUT.
 */
export async function DELETE(request: NextRequest) {
  const session = await verifyPatientAuth(request);
  if (!session) return patientAuthError(request);

  try {
    await connectDB();
    const refused = await refuseForAdultFamilyMember(session);
    if (refused) return refused;
    const result = await setPhoto(session.patientId, null);
    if (result.matchedCount === 0) return bad('Account is inactive. Please contact the clinic.', 403);
    logger.info('Patient removed profile picture', { patientId: session.patientId });
    return NextResponse.json({ success: true, data: { profileImage: null } });
  } catch (error) {
    logger.error('Error removing patient profile picture', error as Error);
    return bad('Failed to remove the picture', 500);
  }
}
