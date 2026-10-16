import { redirect } from 'next/navigation';
import connectDB from '@/lib/mongodb';
import { verifySession } from '@/app/lib/dal';
import { getPermissionChecker } from '@/app/lib/auth-helpers';
import { canSeeDoctorActivity, myDoctorProfileId } from '@/lib/doctor-access';

export interface DoctorPermissions {
  /** Add a doctor (doctors:write, the POST check). */
  canAdd: boolean;
  /** Edit profiles, anyone's hours and the internal notes (doctors:update). */
  canEdit: boolean;
  /** Delete a profile (doctors:delete). */
  canDelete: boolean;
  /** The whole clinic's workload figures (admins and accountants, as the productivity reports). */
  canSeePerformance: boolean;
  /** Booking counts on the roster (appointments:read). */
  canSeeBookings: boolean;
  /** Book from a doctor's page (appointments:write). */
  canBook: boolean;
  /** The signed-in user's own doctor profile: they may change its hours and see its figures. */
  myDoctorId: string | null;
}

/** Doctors pages follow the doctors permission, as the API does, plus the session's own profile. */
export async function loadDoctorPermissions(required: 'read' | 'write' | 'update' = 'read'): Promise<DoctorPermissions> {
  const session = await verifySession();
  if (!session) redirect('/login');
  const can = await getPermissionChecker(session);
  if (!can('doctors', required)) redirect(required === 'read' ? '/dashboard?error=access_denied' : '/doctors?error=access_denied');

  await connectDB();
  const myDoctorId = session.tenantId ? await myDoctorProfileId(session.tenantId, session.userId) : null;
  return {
    canAdd: can('doctors', 'write'),
    canEdit: can('doctors', 'update'),
    canDelete: can('doctors', 'delete'),
    canSeePerformance: canSeeDoctorActivity(session, null),
    canSeeBookings: can('appointments', 'read'),
    canBook: can('appointments', 'write'),
    myDoctorId,
  };
}
