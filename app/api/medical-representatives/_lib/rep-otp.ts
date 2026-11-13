import 'server-only';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { phoneVariants } from '@/app/api/patients/auth/shared';

/** How long a texted sign-in code works (lib/otp's fixed lifetime). */
export { OTP_EXPIRY_MINUTES as REP_LOGIN_CODE_MINUTES } from '@/lib/otp';

/**
 * Reps who can sign in by a code texted to this number: only numbers proven with a code at sign-up
 * (`phoneVerifiedAt`). A number a clinic or the web form typed in was never checked, and a typo
 * there must not hand a stranger the account. At most two are read: two means "ambiguous".
 */
export async function findRepsByVerifiedPhone(phone: string) {
  await connectDB();
  return MedicalRepresentative.find({ phone: { $in: phoneVariants(phone) }, phoneVerifiedAt: { $type: 'date' } })
    .select('_id userId email firstName lastName company status isActivated paymentStatus')
    .limit(2);
}

export function repLoginCodeMessage(code: string, minutes: number): string {
  return `Your eMedRoute sign-in code is ${code}. It expires in ${minutes} minutes. Never share this code.`;
}
