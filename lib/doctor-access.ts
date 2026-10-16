import User from '@/models/User';
import { isAdmin } from '@/app/lib/auth-helpers';
import { tenantFilter } from '@/lib/api/tenant-session';

/** The doctor profile linked to this login, if any. */
export async function myDoctorProfileId(tenantId: string, userId: string): Promise<string | null> {
  const user = await User.findOne(tenantFilter(tenantId, { _id: userId }))
    .select('doctorProfile')
    .lean<{ doctorProfile?: unknown } | null>();
  return user?.doctorProfile ? String(user.doctorProfile) : null;
}

/**
 * Workload and money figures for a doctor: admins and accountants see every doctor, a doctor sees
 * their own. The same rule as the productivity reports, so a medical representative (who may read
 * the roster) never sees a doctor's numbers.
 */
export function canSeeDoctorActivity(session: { role?: string }, myDoctorId: string | null, doctorId?: string) {
  if (isAdmin(session) || session.role === 'accountant') return true;
  return Boolean(doctorId && myDoctorId === doctorId);
}
