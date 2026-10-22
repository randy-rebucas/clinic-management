import 'server-only';
import type { Types } from 'mongoose';
import { normalizePhone } from '@/lib/phone';
import { isMinor } from '@/lib/patient-family';
import type { PatientTokenClaims } from '@/app/lib/dal';

type OtpPatient = { phone?: string | null; dateOfBirth?: unknown; tenantIds?: unknown[] | null };

/**
 * What a phone-OTP sign-in to `patient` proves, given the number the code went to:
 * - the patient's own number: their phone (`amr: 'otp'`), every clinic, and `linkRecords`;
 * - a contact number on a minor's record (a parent for a child with no phone): one clinic only,
 *   no phone proof, no linking;
 * - a contact number on an adult's record: nothing (null). Nobody signs in as another adult.
 */
export function otpSignInScope(
  patient: OtpPatient,
  phone: string,
  tenantId?: Types.ObjectId
): { claims: PatientTokenClaims; linkRecords: boolean } | null {
  const proven = normalizePhone(phone);
  if (proven && patient.phone && normalizePhone(patient.phone) === proven) {
    return { claims: { amr: 'otp' }, linkRecords: true };
  }
  if (!isMinor(patient.dateOfBirth)) return null;
  const tid = tenantId ?? patient.tenantIds?.[0];
  return { claims: tid ? { tid: String(tid) } : {}, linkRecords: false };
}
