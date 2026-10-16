import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { getPermissionChecker } from '@/app/lib/auth-helpers';

export interface LabResultsPageContext {
  canWrite: boolean;
  /** Doctors open on the tests they ordered; everyone else on the whole clinic. */
  isDoctor: boolean;
}

export interface LabResultDetailPermissions {
  /** Enter results, review, attach, tell the patient, cancel (lab-results:update). */
  canUpdate: boolean;
  canSeePatient: boolean;
  canSeeVisit: boolean;
}

export async function loadLabResultDetailPermissions(): Promise<LabResultDetailPermissions> {
  const session = await verifySession();
  if (!session) redirect('/login');
  const can = await getPermissionChecker(session);
  if (!can('lab-results', 'read')) redirect('/dashboard?error=access_denied');
  return { canUpdate: can('lab-results', 'update'), canSeePatient: can('patients', 'read'), canSeeVisit: can('visits', 'read') };
}

export async function loadLabResultsPageContext(): Promise<LabResultsPageContext> {
  const session = await verifySession();
  if (!session) redirect('/login');
  const can = await getPermissionChecker(session);
  if (!can('lab-results', 'read')) redirect('/dashboard?error=access_denied');
  return { canWrite: can('lab-results', 'write'), isDoctor: session.role === 'doctor' };
}
