import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { denyPage, getPermissionChecker } from '@/app/lib/auth-helpers';
import { canReviewLabs, isLabRole } from '@/lib/lab-results';

export interface LabResultsPageContext {
  canWrite: boolean;
  /** Doctors open on the tests they ordered; everyone else on the whole clinic. */
  isDoctor: boolean;
  /** Lab staff open on the requests still waiting for them. */
  isLab: boolean;
}

export interface LabResultDetailPermissions {
  /** Enter results, review, attach, tell the patient, cancel (lab-results:update). */
  canUpdate: boolean;
  /** Mark a result reviewed: clinicians, not lab staff. */
  canReview: boolean;
  /** Lab staff: "receive" a request rather than send its sample out. */
  isLab: boolean;
  canSeePatient: boolean;
  canSeeVisit: boolean;
}

export async function loadLabResultDetailPermissions(): Promise<LabResultDetailPermissions> {
  const session = await verifySession();
  if (!session) redirect('/login');
  const can = await getPermissionChecker(session);
  if (!can('lab-results', 'read')) await denyPage(session, 'lab-results', 'read', '/dashboard?error=access_denied');
  return {
    canUpdate: can('lab-results', 'update'),
    canReview: canReviewLabs(session.role),
    isLab: isLabRole(session.role),
    canSeePatient: can('patients', 'read'),
    canSeeVisit: can('visits', 'read'),
  };
}

export async function loadLabResultsPageContext(): Promise<LabResultsPageContext> {
  const session = await verifySession();
  if (!session) redirect('/login');
  const can = await getPermissionChecker(session);
  if (!can('lab-results', 'read')) await denyPage(session, 'lab-results', 'read', '/dashboard?error=access_denied');
  return { canWrite: can('lab-results', 'write'), isDoctor: session.role === 'doctor', isLab: isLabRole(session.role) };
}
