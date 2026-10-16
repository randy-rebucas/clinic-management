import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { getPermissionChecker } from '@/app/lib/auth-helpers';
import { myDoctorProfileId } from '@/lib/doctor-access';

export interface ReferralsPageContext {
  /** Make a referral (referrals:write, the POST check). */
  canWrite: boolean;
  /** The login is linked to a doctor profile, so "Mine" and "waiting for your answer" mean something. */
  hasDoctorProfile: boolean;
  /** Doctors open on their own referrals; everyone else on the whole clinic. */
  isDoctor: boolean;
}

export interface ReferralDetailPermissions {
  /** Accept, decline, mark seen, cancel, edit (referrals:update). */
  canUpdate: boolean;
  canWrite: boolean;
  canSeePatient: boolean;
  canSeeVisit: boolean;
  canSeeAppointment: boolean;
  /** Book the patient with the receiving doctor (appointments:write). */
  canBook: boolean;
}

async function checker() {
  const session = await verifySession();
  if (!session) redirect('/login');
  const can = await getPermissionChecker(session);
  if (!can('referrals', 'read')) redirect('/dashboard?error=access_denied');
  return { session, can };
}

export async function loadReferralsPageContext(): Promise<ReferralsPageContext> {
  const { session, can } = await checker();
  const me = session.tenantId ? await myDoctorProfileId(session.tenantId, session.userId) : null;
  return { canWrite: can('referrals', 'write'), hasDoctorProfile: Boolean(me), isDoctor: session.role === 'doctor' };
}

export async function loadReferralDetailPermissions(): Promise<ReferralDetailPermissions> {
  const { can } = await checker();
  return {
    canUpdate: can('referrals', 'update'),
    canWrite: can('referrals', 'write'),
    canSeePatient: can('patients', 'read'),
    canSeeVisit: can('visits', 'read'),
    canSeeAppointment: can('appointments', 'read'),
    canBook: can('appointments', 'write'),
  };
}

/** The new and edit pages. Roles grant `write`/`update` for referrals; there is no `create` action. */
export async function requireReferralFormAccess(action: 'write' | 'update') {
  const { can } = await checker();
  if (!can('referrals', action)) redirect('/referrals?error=access_denied');
}
