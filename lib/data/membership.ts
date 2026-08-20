/**
 * Data-access layer for the Membership model (Phase 5 Batch 5 — billing).
 * Membership carries a direct `tenantId` column (DIRECTLY_SCOPED_MODELS in
 * lib/prisma-tenant-extension.ts) — standard runWithTenant(tenantId, fn)
 * scoping applies.
 *
 * Every function below assumes an active tenant context has already been
 * established by the caller. Functions here do not open their own context.
 *
 * transactions[] is a child table (MembershipTransaction). Membership.
 * referrals (Patient[] in Mongoose) is NOT a stored column here — it's
 * derived via Patient.memberReferralsMade (patients whose membership.
 * referredById points at this patient); see prisma/MIGRATION_NOTES.md's
 * "Membership" section and the schema comment on Membership.referredById.
 * getReferredPatients() below implements that derived lookup for routes
 * that need to render the old `membership.referrals` array.
 *
 * addPointsTransaction() recomputes points/totalPointsEarned/
 * totalPointsRedeemed and nested-creates the new MembershipTransaction row
 * in a SINGLE `prisma.membership.update()` call — same atomicity pattern as
 * recordPharmacyDispense() in lib/data/prescription.ts and recordPayment()
 * in lib/data/invoice.ts.
 *
 * Field mapping mirrors scripts/migrate-to-postgres/migrate.ts's
 * migrateMemberships().
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

export const membershipInclude = {
  patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
  referredBy: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
  transactions: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.MembershipInclude;

type MembershipWithRelations = Prisma.MembershipGetPayload<{ include: typeof membershipInclude }>;

export function toMembershipDTO(membership: MembershipWithRelations, referrals?: any[]) {
  const { id, ...rest } = membership;
  return {
    _id: id,
    id,
    ...rest,
    referrals: referrals ?? [],
  };
}

/** Flatten nested API input (create or update body) into Prisma scalar columns. */
export function flattenMembershipInput(body: Record<string, any>): Record<string, any> {
  const flat: Record<string, any> = { ...body };
  delete flat.transactions;
  delete flat.patient;
  delete flat.referredBy;
  delete flat.referrals;
  delete flat.tenantId;
  delete flat.id;
  delete flat._id;
  delete flat.createdAt;
  delete flat.updatedAt;
  return flat;
}

export interface MembershipFilter {
  patientId?: string;
  tier?: string;
  status?: string;
}

export function buildMembershipWhere(filter: MembershipFilter): Prisma.MembershipWhereInput {
  const where: Prisma.MembershipWhereInput = {};
  if (filter.patientId) where.patientId = filter.patientId;
  if (filter.tier) where.tier = filter.tier as Prisma.MembershipWhereInput['tier'];
  if (filter.status) where.status = filter.status as Prisma.MembershipWhereInput['status'];
  return where;
}

export async function listMemberships(where: Prisma.MembershipWhereInput) {
  const memberships = await prisma.membership.findMany({
    where,
    include: membershipInclude,
    orderBy: { createdAt: 'desc' },
  });
  return memberships.map((m) => toMembershipDTO(m));
}

/** Patients whose membership.referredById points at `patientId` — the derived equivalent of Mongoose's Membership.referrals[]. */
export async function getReferredPatients(patientId: string) {
  const referred = await prisma.membership.findMany({
    where: { referredById: patientId },
    select: { patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } } },
  });
  return referred.map((m) => m.patient);
}

export async function getMembershipById(id: string) {
  const membership = await prisma.membership.findUnique({ where: { id }, include: membershipInclude });
  if (!membership) return null;
  const referrals = await getReferredPatients(membership.patientId);
  return toMembershipDTO(membership, referrals);
}

export async function getMembershipByPatientId(patientId: string) {
  return prisma.membership.findUnique({ where: { patientId } });
}

export function findMembershipRawById(id: string) {
  return prisma.membership.findUnique({ where: { id } });
}

export async function createMembership(body: Record<string, any>, refs: { patientId: string; referredById?: string }) {
  const flat = flattenMembershipInput(body);
  const membershipNumber = body.membershipNumber || `MEM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const tierBenefits: Record<string, { discount: number; benefits: string[] }> = {
    bronze: { discount: 5, benefits: ['points_earn'] },
    silver: { discount: 10, benefits: ['points_earn', 'priority_booking'] },
    gold: { discount: 15, benefits: ['points_earn', 'priority_booking', 'free_consultation_monthly'] },
    platinum: { discount: 20, benefits: ['points_earn', 'priority_booking', 'free_consultation_monthly', 'discount_on_procedures'] },
  };
  const tier = body.tier || 'bronze';
  const tierConfig = tierBenefits[tier] ?? tierBenefits.bronze;

  const membership = await prisma.membership.create({
    data: {
      ...flat,
      membershipNumber,
      tier: tier as Prisma.MembershipCreateInput['tier'],
      discountPercentage: tierConfig.discount,
      benefits: tierConfig.benefits,
      patient: { connect: { id: refs.patientId } },
      referredBy: refs.referredById ? { connect: { id: refs.referredById } } : undefined,
      transactions: { create: [] },
    } as Prisma.MembershipCreateInput,
    include: membershipInclude,
  });
  return toMembershipDTO(membership, []);
}

export async function updateMembership(id: string, body: Record<string, any>) {
  const flat = flattenMembershipInput(body);
  const membership = await prisma.membership.update({
    where: { id },
    data: flat as Prisma.MembershipUpdateInput,
    include: membershipInclude,
  });
  const referrals = await getReferredPatients(membership.patientId);
  return toMembershipDTO(membership, referrals);
}

export async function deleteMembership(id: string) {
  return prisma.membership.delete({ where: { id } });
}

/**
 * Award a referral bonus to an existing membership: recompute points +
 * totalPointsEarned and nested-create the bonus MembershipTransaction row
 * in a single `prisma.membership.update()` call (same atomicity pattern as
 * addPointsTransaction() below).
 */
export async function addReferralBonus(membershipId: string, points: number, description: string) {
  const existing = await prisma.membership.findUniqueOrThrow({ where: { id: membershipId } });
  return prisma.membership.update({
    where: { id: membershipId },
    data: {
      points: existing.points + points,
      totalPointsEarned: existing.totalPointsEarned + points,
      transactions: {
        create: { type: 'earn', points, description, createdAt: new Date() },
      },
    },
    include: membershipInclude,
  });
}

/**
 * Record a points transaction (earn/redeem) and update the points /
 * totalPointsEarned / totalPointsRedeemed aggregate fields together in ONE
 * `prisma.membership.update()` call — the nested `transactions: { create }`
 * and the new aggregate scalars commit atomically, mirroring
 * recordPharmacyDispense() in lib/data/prescription.ts and recordPayment()
 * in lib/data/invoice.ts.
 */
export async function addPointsTransaction(
  id: string,
  input: {
    points: number;
    description: string;
    type?: 'earn' | 'redeem' | 'expire' | 'adjustment';
    relatedEntityType?: string;
    relatedEntityId?: string;
  }
): Promise<{ ok: true; membership: MembershipWithRelations } | { ok: false; error: string }> {
  const existing = await prisma.membership.findUniqueOrThrow({ where: { id } });

  const transactionType = input.type || (input.points > 0 ? 'earn' : 'redeem');
  const pointsAbs = Math.abs(input.points);

  let points = existing.points;
  let totalPointsEarned = existing.totalPointsEarned;
  let totalPointsRedeemed = existing.totalPointsRedeemed;

  if (transactionType === 'earn') {
    points += pointsAbs;
    totalPointsEarned += pointsAbs;
  } else if (transactionType === 'redeem') {
    if (existing.points < pointsAbs) {
      return { ok: false, error: 'Insufficient points' };
    }
    points -= pointsAbs;
    totalPointsRedeemed += pointsAbs;
  }

  const membership = await prisma.membership.update({
    where: { id },
    data: {
      points,
      totalPointsEarned,
      totalPointsRedeemed,
      transactions: {
        create: {
          type: transactionType as Prisma.MembershipTransactionCreateWithoutMembershipInput['type'],
          points: pointsAbs,
          description: input.description,
          relatedEntityType: (input.relatedEntityType as Prisma.MembershipTransactionCreateWithoutMembershipInput['relatedEntityType']) ?? undefined,
          relatedEntityId: input.relatedEntityId ?? undefined,
          createdAt: new Date(),
        },
      },
    },
    include: membershipInclude,
  });

  return { ok: true, membership };
}
