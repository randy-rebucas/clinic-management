import connectDB from '@/lib/mongodb';
import logger from '@/lib/logger';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import Product from '@/models/Product';
import User from '@/models/User';

/** Long past a PayMongo checkout. */
export const UNPAID_SIGNUP_DAYS = 14;
const BATCH_LIMIT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Remove public rep signups that abandoned their online payment, freeing the address.
 *
 * `paymentAmount` is set only when a checkout was made, so reps waiting for the team to handle
 * their payment never match, and clinic-added reps carry `tenantIds`. A record with any payment,
 * team or linked activity stays too: this only clears signups nothing else depends on.
 */
export async function cleanupUnpaidRepSignups(now = new Date()): Promise<{ deleted: number; kept: number }> {
  await connectDB();

  const candidates = await MedicalRepresentative.find({
    'tenantIds.0': { $exists: false },
    status: 'inactive',
    isActivated: false,
    paymentStatus: 'pending',
    paymentAmount: { $gt: 0 },
    paymentReference: { $in: [null, ''] },
    teamId: null,
    createdAt: { $lt: new Date(now.getTime() - UNPAID_SIGNUP_DAYS * DAY_MS) },
  })
    .select('_id userId')
    .limit(BATCH_LIMIT)
    .lean<{ _id: unknown; userId?: unknown }[]>();

  if (!candidates.length) return { deleted: 0, kept: 0 };

  const ids = candidates.map((rep) => rep._id);
  const [visited, listed] = await Promise.all([
    MedicalRepresentativeVisit.distinct('medicalRepresentativeId', { medicalRepresentativeId: { $in: ids } }),
    Product.distinct('medicalRepresentativeId', { medicalRepresentativeId: { $in: ids } }),
  ]);
  const inUse = new Set([...visited, ...listed].map(String));
  const removable = candidates.filter((rep) => !inUse.has(String(rep._id)));
  const removableIds = removable.map((rep) => rep._id);

  if (removableIds.length) {
    // Only the login made for this signup: the save hook can link a rep to a user that already existed.
    await User.deleteMany({
      _id: { $in: removable.map((rep) => rep.userId).filter(Boolean) },
      medicalRepresentativeProfile: { $in: removableIds },
    });
    await MedicalRepresentative.deleteMany({ _id: { $in: removableIds } });
  }

  logger.info('Unpaid medical rep signups removed', { deleted: removableIds.length, kept: candidates.length - removableIds.length });
  return { deleted: removableIds.length, kept: candidates.length - removableIds.length };
}
