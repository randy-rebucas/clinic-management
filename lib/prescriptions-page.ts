import { redirect } from 'next/navigation';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { verifySession } from '@/app/lib/dal';
import { denyPage, getPermissionChecker } from '@/app/lib/auth-helpers';

export interface PrescriptionsPageContext {
  canWrite: boolean;
  /** Doctors open on their own prescriptions; everyone else on the whole clinic. */
  isDoctor: boolean;
  /** The signed-in user's name, shown on the signature line of a new prescription. */
  providerName: string;
}

export interface PrescriptionDetailPermissions {
  /** Record a dispense, cancel or close (prescriptions:update). */
  canUpdate: boolean;
  canSeePatient: boolean;
  canSeeVisit: boolean;
}

export async function loadPrescriptionDetailPermissions(): Promise<PrescriptionDetailPermissions> {
  const session = await verifySession();
  if (!session) redirect('/login');

  const can = await getPermissionChecker(session);
  if (!can('prescriptions', 'read')) await denyPage(session, 'prescriptions', 'read', '/dashboard?error=access_denied');

  return { canUpdate: can('prescriptions', 'update'), canSeePatient: can('patients', 'read'), canSeeVisit: can('visits', 'read') };
}

export async function loadPrescriptionsPageContext(): Promise<PrescriptionsPageContext> {
  const session = await verifySession();
  if (!session) redirect('/login');

  const can = await getPermissionChecker(session);
  if (!can('prescriptions', 'read')) await denyPage(session, 'prescriptions', 'read', '/dashboard?error=access_denied');

  await connectDB();
  const user = (await User.findById(session.userId).select('name').lean()) as { name?: string } | null;

  return {
    canWrite: can('prescriptions', 'write'),
    isDoctor: session.role === 'doctor',
    providerName: user?.name || session.email,
  };
}
