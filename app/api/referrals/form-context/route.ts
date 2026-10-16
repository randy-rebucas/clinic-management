import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Referral from '@/models/Referral';
import Doctor from '@/models/Doctor';
import '@/models/Specialization';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { myDoctorProfileId } from '@/lib/doctor-access';

/**
 * GET /api/referrals/form-context
 * What the referral form offers: this clinic's doctors (with specialty and whether they're away),
 * the signed-in user's own doctor profile (the default sender), and the outside clinics and
 * specialties used on earlier referrals, as suggestions.
 */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'referrals', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const [doctors, me, clinics, specialties] = await Promise.all([
      Doctor.find({ tenantId: tenantObjectId, status: { $in: ['active', 'on-leave'] } })
        .select('firstName lastName title status specializationId')
        .populate('specializationId', 'name')
        .sort({ lastName: 1, firstName: 1 })
        .lean<any[]>(),
      myDoctorProfileId(tenantId, session.userId),
      Referral.aggregate([
        { $match: { tenantId: tenantObjectId } },
        { $project: { names: ['$receivingClinic', '$referringClinic'] } },
        { $unwind: '$names' },
        { $project: { name: { $trim: { input: { $ifNull: ['$names', ''] } } } } },
        { $match: { name: { $ne: '' } } },
        { $group: { _id: { $toLower: '$name' }, name: { $first: '$name' }, n: { $sum: 1 } } },
        { $sort: { n: -1, _id: 1 } },
        { $limit: 40 },
      ]),
      Referral.aggregate([
        { $match: { tenantId: tenantObjectId, specialty: { $nin: [null, ''] } } },
        { $group: { _id: { $toLower: { $trim: { input: '$specialty' } } }, name: { $first: { $trim: { input: '$specialty' } } }, n: { $sum: 1 } } },
        { $sort: { n: -1, _id: 1 } },
        { $limit: 40 },
      ]),
    ]);

    const doctorSpecialties = doctors.map((d) => d.specializationId?.name).filter(Boolean) as string[];
    const specialtyNames = [...new Map([...(specialties as { name: string }[]).map((s) => s.name), ...doctorSpecialties].map((n) => [n.toLowerCase(), n])).values()];

    return NextResponse.json({
      success: true,
      data: {
        doctors: doctors.map((d) => ({
          _id: String(d._id),
          name: `Dr. ${d.firstName} ${d.lastName}`.trim(),
          specialty: d.specializationId?.name ?? null,
          onLeave: d.status === 'on-leave',
        })),
        myDoctorId: me,
        clinics: (clinics as { name: string }[]).map((c) => c.name),
        specialties: specialtyNames,
      },
    });
  } catch (error) {
    console.error('Error loading referral form context:', error);
    return NextResponse.json({ success: false, error: 'Failed to load the referral form' }, { status: 500 });
  }
}
