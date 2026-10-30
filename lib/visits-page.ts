import { redirect } from 'next/navigation';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { verifySession } from '@/app/lib/dal';
import { denyPage, getPermissionChecker } from '@/app/lib/auth-helpers';
import { canIssueMedicalCertificates } from '@/lib/doctor-access';
import { STAFF_SENDER_ROLES } from '@/lib/notify';

export interface VisitsPageContext {
  canWrite: boolean;
  canSeeQueue: boolean;
  /** Doctors open on their own visits; everyone else on the whole clinic. */
  isDoctor: boolean;
  /** The doctor profile behind this user, so "ready for you" shows only patients sent to them. */
  doctorProfileId: string | null;
}

export async function loadVisitsPageContext(): Promise<VisitsPageContext> {
  const session = await verifySession();
  if (!session) redirect('/login');

  const can = await getPermissionChecker(session);
  if (!can('visits', 'read')) await denyPage(session, 'visits', 'read', '/dashboard?error=access_denied');

  const isDoctor = session.role === 'doctor';
  let doctorProfileId: string | null = null;
  if (isDoctor) {
    await connectDB();
    const user = (await User.findById(session.userId).select('doctorProfile').lean()) as { doctorProfile?: unknown } | null;
    doctorProfileId = user?.doctorProfile ? String(user.doctorProfile) : null;
  }

  return { canWrite: can('visits', 'write'), canSeeQueue: can('queue', 'read'), isDoctor, doctorProfileId };
}

export interface VisitDetailPermissions {
  /** visits:update — edit the note, change its status, attach files */
  canUpdate: boolean;
  /** patients:read — link through to the patient record */
  canSeePatient: boolean;
  /** appointments:write — book the patient's next appointment */
  canBook: boolean;
  /** appointments:read — open the follow-up booked from this visit */
  canSeeAppointments: boolean;
  /** Doctors and clinic admins — print the visit's medical certificate (lib/doctor-access.ts) */
  canIssueCertificate: boolean;
  /** Doctors and admins — send the patient a message in the patient app */
  canMessage: boolean;
}

export async function loadVisitDetailPermissions(): Promise<VisitDetailPermissions> {
  const session = await verifySession();
  if (!session) redirect('/login');

  const can = await getPermissionChecker(session);
  if (!can('visits', 'read')) await denyPage(session, 'visits', 'read', '/dashboard?error=access_denied');

  return {
    canUpdate: can('visits', 'update'),
    canSeePatient: can('patients', 'read'),
    canBook: can('appointments', 'write'),
    canSeeAppointments: can('appointments', 'read'),
    canIssueCertificate: await canIssueMedicalCertificates(session),
    canMessage: STAFF_SENDER_ROLES.includes(session.role) && !session.imp,
  };
}
