import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { EXPIRING_DAYS } from '@/lib/documents';

/**
 * GET /api/documents/insights
 *
 * What the documents page opens with, clinic-wide and in one aggregation: active documents by
 * kind, what is not filed to any patient, what has expired or expires within 30 days, how many
 * are staff only, and the storage the files take.
 */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'documents', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const now = new Date();
    const horizon = new Date(now.getTime() + EXPIRING_DAYS * 86400000);
    const expiry = { $ifNull: ['$expiryDate', '$medicalCertificate.validUntil'] };
    const unfiled = { $or: [{ patient: { $exists: false } }, { patient: null }] };

    const [facets] = await Document.aggregate([
      { $match: { tenantId: tenantObjectId, status: { $in: ['active', 'archived'] } } },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
                archived: { $sum: { $cond: [{ $eq: ['$status', 'archived'] }, 1, 0] } },
                bytes: { $sum: { $ifNull: ['$size', 0] } },
                confidential: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'active'] }, { $eq: ['$isConfidential', true] }] }, 1, 0] } },
              },
            },
          ],
          byCategory: [{ $match: { status: 'active' } }, { $group: { _id: '$category', count: { $sum: 1 } } }],
          unfiledCount: [{ $match: { status: 'active', ...unfiled } }, { $count: 'n' }],
          unfiled: [
            { $match: { status: 'active', ...unfiled } },
            { $sort: { uploadDate: -1 } },
            { $limit: 4 },
            { $project: { title: 1, documentCode: 1, uploadDate: 1, category: 1 } },
          ],
          expiring: [
            { $match: { status: 'active' } },
            { $addFields: { _expiry: expiry } },
            { $match: { _expiry: { $ne: null, $lte: horizon } } },
            { $sort: { _expiry: 1 } },
            {
              $group: {
                _id: null,
                expired: { $sum: { $cond: [{ $lt: ['$_expiry', now] }, 1, 0] } },
                soon: { $sum: { $cond: [{ $gte: ['$_expiry', now] }, 1, 0] } },
                next: { $push: { _id: '$_id', title: '$title', category: '$category', patient: '$patient', expiry: '$_expiry' } },
              },
            },
            { $project: { expired: 1, soon: 1, next: { $slice: ['$next', 4] } } },
          ],
        },
      },
    ]);

    const t = facets.totals[0] ?? { active: 0, archived: 0, bytes: 0, confidential: 0 };
    const exp = facets.expiring[0] ?? { expired: 0, soon: 0, next: [] };
    // Names for the few expiring rows, scoped to patients of this clinic.
    const ids = exp.next.map((x: { patient?: unknown }) => x.patient).filter(Boolean);
    const people = ids.length
      ? await Patient.find({ _id: { $in: ids }, tenantIds: tenantObjectId }).select('firstName lastName').lean<{ _id: unknown; firstName: string; lastName: string }[]>()
      : [];
    const nameOf = new Map(people.map((p) => [String(p._id), `${p.firstName} ${p.lastName}`]));

    return NextResponse.json({
      success: true,
      data: {
        active: t.active,
        archived: t.archived,
        bytes: t.bytes,
        confidential: t.confidential,
        byCategory: Object.fromEntries(facets.byCategory.map((r: { _id: string; count: number }) => [r._id || 'other', r.count])),
        unfiled: { count: facets.unfiledCount[0]?.n ?? 0, newest: facets.unfiled },
        expiring: {
          expired: exp.expired,
          soon: exp.soon,
          next: exp.next.map((x: { _id: unknown; title: string; category: string; patient?: unknown; expiry: Date }) => ({
            _id: String(x._id),
            title: x.title,
            category: x.category,
            patientName: x.patient ? (nameOf.get(String(x.patient)) ?? null) : null,
            expiry: x.expiry,
          })),
        },
      },
    });
  } catch (error) {
    console.error('Error building document insights:', error);
    return NextResponse.json({ success: false, error: 'Failed to load the document figures' }, { status: 500 });
  }
}
