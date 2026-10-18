import { redirect } from 'next/navigation';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import '@/models/Specialization';
import { verifySession } from '@/app/lib/dal';
import { denyPage, getPermissionChecker } from '@/app/lib/auth-helpers';
import { tenantFilter } from '@/lib/api/tenant-session';

export interface SchedulingDoctor {
  _id: string;
  firstName: string;
  lastName: string;
  status?: string;
  specializationId: { name?: string } | null;
}

/** The clinic's doctors as names and specialty only, for scheduling and queue screens. */
export async function loadClinicDoctors(tenantId: string): Promise<SchedulingDoctor[]> {
  await connectDB();
  const rows = await Doctor.find(tenantFilter(tenantId))
    .select('firstName lastName status specializationId')
    .populate('specializationId', 'name')
    .sort({ lastName: 1, firstName: 1 })
    .lean();
  return (rows as unknown as { _id: unknown; firstName?: string; lastName?: string; status?: string; specializationId?: { name?: string } | null }[]).map(
    (d) => ({
      _id: String(d._id),
      firstName: d.firstName ?? '',
      lastName: d.lastName ?? '',
      status: d.status,
      specializationId: d.specializationId?.name ? { name: String(d.specializationId.name) } : null,
    })
  );
}

/**
 * What the appointments screens need from the server: the caller's appointment/queue
 * permissions, and the clinic's doctors as names only. Scheduling needs the roster even
 * for roles without `doctors:read` (a doctor booking a follow-up), so it is read here
 * rather than through /api/doctors.
 */
export async function loadAppointmentsPageContext(required: 'read' | 'write') {
  const session = await verifySession();
  if (!session) redirect('/login');

  const can = await getPermissionChecker(session);
  if (!can('appointments', required)) await denyPage(session, 'appointments', required, '/dashboard?error=access_denied');

  return {
    doctors: session.tenantId ? await loadClinicDoctors(session.tenantId) : [],
    permissions: {
      canBook: can('appointments', 'write'),
      canUpdate: can('appointments', 'update'),
      canSeeQueue: can('queue', 'read'),
      canQueue: can('queue', 'write'),
    },
  };
}
