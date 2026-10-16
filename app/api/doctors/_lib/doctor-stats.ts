import { Types } from 'mongoose';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import Prescription from '@/models/Prescription';
import Invoice from '@/models/Invoice';
import User from '@/models/User';
import { tenantFilter } from '@/lib/api/tenant-session';

export type DateWindow = { start?: Date | null; end?: Date | null };

export type DoctorStats = {
  appointmentsByStatus: Record<string, number>;
  totalAppointments: number;
  visitsByStatus: Record<string, number>;
  visitsByType: Record<string, number>;
  totalVisits: number;
  prescriptionsByStatus: Record<string, number>;
  totalPrescriptions: number;
  totalRevenue: number;
  totalBilled: number;
  outstandingRevenue: number;
};

function emptyStats(): DoctorStats {
  return {
    appointmentsByStatus: {},
    totalAppointments: 0,
    visitsByStatus: {},
    visitsByType: {},
    totalVisits: 0,
    prescriptionsByStatus: {},
    totalPrescriptions: 0,
    totalRevenue: 0,
    totalBilled: 0,
    outstandingRevenue: 0,
  };
}

function rangeCond(window: DateWindow): Record<string, Date> | null {
  const cond: Record<string, Date> = {};
  if (window.start) cond.$gte = window.start;
  if (window.end) cond.$lte = window.end;
  return Object.keys(cond).length ? cond : null;
}

/**
 * Per-doctor productivity counts for one clinic, computed with one aggregation per
 * collection. Visits and prescriptions reference the doctor's User account, so both the
 * Doctor id and the linked User id are matched.
 */
export async function computeDoctorStats(
  tenantId: string,
  doctorIds: Types.ObjectId[],
  window: DateWindow = {}
): Promise<Map<string, DoctorStats>> {
  const stats = new Map<string, DoctorStats>();
  doctorIds.forEach((id) => stats.set(String(id), emptyStats()));
  if (doctorIds.length === 0) return stats;

  const tenantObjectId = new Types.ObjectId(tenantId);
  const users = await User.find(tenantFilter(tenantId, { doctorProfile: { $in: doctorIds } }))
    .select('_id doctorProfile')
    .lean() as any[];

  const ownerOf = new Map<string, string>();
  doctorIds.forEach((id) => ownerOf.set(String(id), String(id)));
  users.forEach((u) => ownerOf.set(String(u._id), String(u.doctorProfile)));
  const actorIds = [...doctorIds, ...users.map((u) => u._id as Types.ObjectId)];

  const range = rangeCond(window);
  const appointmentMatch: Record<string, unknown> = { tenantId: tenantObjectId, doctor: { $in: doctorIds } };
  const visitMatch: Record<string, unknown> = { tenantId: tenantObjectId, provider: { $in: actorIds } };
  const prescriptionMatch: Record<string, unknown> = { tenantId: tenantObjectId, prescribedBy: { $in: actorIds } };
  const invoiceMatch: Record<string, unknown> = { tenantId: tenantObjectId, visit: { $ne: null } };
  if (range) {
    appointmentMatch.appointmentDate = range;
    visitMatch.date = range;
    prescriptionMatch.issuedAt = range;
    invoiceMatch.createdAt = range;
  }

  const visitLinkMatch: Record<string, unknown> = {
    'v.tenantId': tenantObjectId,
    'v.provider': { $in: actorIds },
  };
  if (range) visitLinkMatch['v.date'] = range;

  const [appointmentRows, visitRows, prescriptionRows, invoiceRows] = await Promise.all([
    Appointment.aggregate([
      { $match: appointmentMatch },
      { $group: { _id: { owner: '$doctor', status: '$status' }, count: { $sum: 1 } } },
    ]),
    Visit.aggregate([
      { $match: visitMatch },
      { $group: { _id: { owner: '$provider', status: '$status', type: '$visitType' }, count: { $sum: 1 } } },
    ]),
    Prescription.aggregate([
      { $match: prescriptionMatch },
      { $group: { _id: { owner: '$prescribedBy', status: '$status' }, count: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      { $match: invoiceMatch },
      { $lookup: { from: Visit.collection.name, localField: 'visit', foreignField: '_id', as: 'v' } },
      { $unwind: '$v' },
      { $match: visitLinkMatch },
      {
        $group: {
          _id: '$v.provider',
          paid: { $sum: { $ifNull: ['$totalPaid', 0] } },
          billed: { $sum: { $ifNull: ['$total', 0] } },
          outstanding: { $sum: { $ifNull: ['$outstandingBalance', 0] } },
        },
      },
    ]),
  ]);

  const statsFor = (actor: unknown) => {
    const owner = ownerOf.get(String(actor));
    return owner ? stats.get(owner) : undefined;
  };

  appointmentRows.forEach((row: any) => {
    const s = statsFor(row._id.owner);
    if (!s) return;
    const status = row._id.status || 'scheduled';
    s.appointmentsByStatus[status] = (s.appointmentsByStatus[status] || 0) + row.count;
    s.totalAppointments += row.count;
  });

  visitRows.forEach((row: any) => {
    const s = statsFor(row._id.owner);
    if (!s) return;
    const status = row._id.status || 'open';
    const type = row._id.type || 'consultation';
    s.visitsByStatus[status] = (s.visitsByStatus[status] || 0) + row.count;
    s.visitsByType[type] = (s.visitsByType[type] || 0) + row.count;
    s.totalVisits += row.count;
  });

  prescriptionRows.forEach((row: any) => {
    const s = statsFor(row._id.owner);
    if (!s) return;
    const status = row._id.status || 'active';
    s.prescriptionsByStatus[status] = (s.prescriptionsByStatus[status] || 0) + row.count;
    s.totalPrescriptions += row.count;
  });

  invoiceRows.forEach((row: any) => {
    const s = statsFor(row._id);
    if (!s) return;
    s.totalRevenue += row.paid;
    s.totalBilled += row.billed;
    s.outstandingRevenue += row.outstanding;
  });

  return stats;
}
