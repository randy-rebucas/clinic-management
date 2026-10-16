import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { getPermissionChecker } from '@/app/lib/auth-helpers';

/** What the signed-in user may do from a patient's page (the API enforces each one again). */
export interface PatientRecordPermissions {
  /** patients:update — edit details, attach and remove files */
  canEdit: boolean;
  /** patients:write — set the patient's app password */
  canSetAppAccess: boolean;
  canStartVisit: boolean;
  canBook: boolean;
  canOrderLab: boolean;
  canInvoice: boolean;
}

export async function loadPatientRecordPermissions(): Promise<PatientRecordPermissions> {
  const session = await verifySession();
  if (!session) redirect('/login');

  const can = await getPermissionChecker(session);
  if (!can('patients', 'read')) redirect('/dashboard?error=access_denied');

  return {
    canEdit: can('patients', 'update'),
    canSetAppAccess: can('patients', 'write'),
    canStartVisit: can('visits', 'write'),
    canBook: can('appointments', 'write'),
    canOrderLab: can('lab-results', 'write'),
    canInvoice: can('invoices', 'write'),
  };
}
