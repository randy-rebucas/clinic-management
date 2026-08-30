/**
 * Data-access layer for the Referral model (Phase 5 Batch 5 — billing).
 * Referral carries a direct `tenantId` column (DIRECTLY_SCOPED_MODELS in
 * lib/prisma-tenant-extension.ts) — standard runWithTenant(tenantId, fn)
 * scoping applies. CRUD only, per the approved batch scope.
 *
 * attachments[] is a child table (ReferralAttachment). Referral.feedback is
 * flattened onto Referral directly (feedbackRating / feedbackComments /
 * feedbackSubmittedById / feedbackSubmittedAt) — see prisma/
 * MIGRATION_NOTES.md's "Referral" section. toReferralDTO() re-nests
 * feedback under its Mongoose-era key for frontend compatibility.
 *
 * Field mapping mirrors scripts/migrate-to-postgres/migrate.ts's
 * migrateReferrals().
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

export const referralInclude = {
  patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
  referringDoctor: { select: { id: true, firstName: true, lastName: true, specializationId: true, specialization: { select: { id: true, name: true } } } },
  receivingDoctor: { select: { id: true, firstName: true, lastName: true, specializationId: true, specialization: { select: { id: true, name: true } } } },
  referringPatient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
  visit: { select: { id: true, visitCode: true, date: true } },
  appointment: { select: { id: true, appointmentCode: true, appointmentDate: true } },
  attachments: true,
  feedbackSubmittedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ReferralInclude;

type ReferralWithRelations = Prisma.ReferralGetPayload<{ include: typeof referralInclude }>;

export function toReferralDTO(referral: ReferralWithRelations) {
  const {
    id,
    referringContactName,
    referringContactPhone,
    referringContactEmail,
    feedbackRating,
    feedbackComments,
    feedbackSubmittedById,
    feedbackSubmittedBy,
    feedbackSubmittedAt,
    ...rest
  } = referral;

  const hasContact = Boolean(referringContactName);
  const hasFeedback = Boolean(feedbackRating || feedbackComments);

  return {
    _id: id,
    id,
    ...rest,
    referringContact: hasContact
      ? { name: referringContactName, phone: referringContactPhone ?? undefined, email: referringContactEmail ?? undefined }
      : undefined,
    feedback: hasFeedback
      ? {
          rating: feedbackRating ?? undefined,
          comments: feedbackComments ?? undefined,
          submittedBy: feedbackSubmittedBy ?? feedbackSubmittedById ?? undefined,
          submittedAt: feedbackSubmittedAt ?? undefined,
        }
      : undefined,
  };
}

/** Flatten nested API input (create or update body) into Prisma scalar columns. */
export function flattenReferralInput(body: Record<string, any>): Record<string, any> {
  const flat: Record<string, any> = { ...body };

  const referringContact = body.referringContact;
  if (referringContact && referringContact.name && String(referringContact.name).trim() !== '') {
    flat.referringContactName = referringContact.name;
    flat.referringContactPhone = referringContact.phone && String(referringContact.phone).trim() !== '' ? referringContact.phone : undefined;
    flat.referringContactEmail = referringContact.email && String(referringContact.email).trim() !== '' ? referringContact.email : undefined;
  }
  delete flat.referringContact;

  const feedback = body.feedback;
  if (feedback) {
    flat.feedbackRating = feedback.rating ?? undefined;
    flat.feedbackComments = feedback.comments ?? undefined;
    flat.feedbackSubmittedById = feedback.submittedBy || undefined;
    flat.feedbackSubmittedAt = feedback.submittedAt ?? new Date();
  }
  delete flat.feedback;

  delete flat.attachments;
  delete flat.patient;
  delete flat.referringDoctor;
  delete flat.receivingDoctor;
  delete flat.referringPatient;
  delete flat.visit;
  delete flat.appointment;
  delete flat.tenantId;
  delete flat.id;
  delete flat._id;
  delete flat.createdAt;
  delete flat.updatedAt;

  return flat;
}

function buildAttachmentCreates(attachments: any[] | undefined): Prisma.ReferralAttachmentCreateWithoutReferralInput[] {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((a) => ({
    filename: a.filename,
    url: a.url,
    uploadDate: a.uploadDate ? new Date(a.uploadDate) : new Date(),
  }));
}

export interface ReferralFilter {
  referringDoctorId?: string;
  receivingDoctorId?: string;
  patientId?: string;
  status?: string;
  type?: string;
}

export function buildReferralWhere(filter: ReferralFilter): Prisma.ReferralWhereInput {
  const where: Prisma.ReferralWhereInput = {};
  if (filter.referringDoctorId) where.referringDoctorId = filter.referringDoctorId;
  if (filter.receivingDoctorId) where.receivingDoctorId = filter.receivingDoctorId;
  if (filter.patientId) where.patientId = filter.patientId;
  if (filter.status) where.status = filter.status as Prisma.ReferralWhereInput['status'];
  if (filter.type) where.type = filter.type as Prisma.ReferralWhereInput['type'];
  return where;
}

export async function listReferrals(where: Prisma.ReferralWhereInput) {
  const referrals = await prisma.referral.findMany({
    where,
    include: referralInclude,
    orderBy: { referredDate: 'desc' },
  });
  return referrals.map(toReferralDTO);
}

export async function getReferralById(id: string) {
  const referral = await prisma.referral.findUnique({ where: { id }, include: referralInclude });
  return referral ? toReferralDTO(referral) : null;
}

export async function countReferrals(where: Prisma.ReferralWhereInput = {}) {
  return prisma.referral.count({ where });
}

export async function createReferral(
  body: Record<string, any>,
  refs: { patientId: string; referringDoctorId?: string; receivingDoctorId?: string; referringPatientId?: string; visitId?: string; appointmentId?: string }
) {
  const flat = flattenReferralInput(body);

  const referral = await prisma.referral.create({
    data: {
      ...flat,
      referredDate: body.referredDate ? new Date(body.referredDate) : new Date(),
      patient: { connect: { id: refs.patientId } },
      referringDoctor: refs.referringDoctorId ? { connect: { id: refs.referringDoctorId } } : undefined,
      receivingDoctor: refs.receivingDoctorId ? { connect: { id: refs.receivingDoctorId } } : undefined,
      referringPatient: refs.referringPatientId ? { connect: { id: refs.referringPatientId } } : undefined,
      visit: refs.visitId ? { connect: { id: refs.visitId } } : undefined,
      appointment: refs.appointmentId ? { connect: { id: refs.appointmentId } } : undefined,
      attachments: { create: buildAttachmentCreates(body.attachments) },
    } as Prisma.ReferralCreateInput,
    include: referralInclude,
  });
  return toReferralDTO(referral);
}

export async function updateReferral(id: string, body: Record<string, any>) {
  const flat = flattenReferralInput(body);
  const referral = await prisma.referral.update({
    where: { id },
    data: flat as Prisma.ReferralUpdateInput,
    include: referralInclude,
  });
  return toReferralDTO(referral);
}

export async function deleteReferral(id: string) {
  return prisma.referral.delete({ where: { id } });
}

/**
 * Highest existing `REF-######` code number, for auto-generation
 * (tenant-scoped by the active context) — mirrors
 * lib/data/visit.ts's getMaxVisitCodeNumber() pattern. Replaces the
 * Mongoose `pre('save')` hook that generated `REF-${Date.now()}-${count}`
 * (see prisma/MIGRATION_NOTES.md's "Referral" section); a sequential
 * max-number scheme is used instead for consistency with the rest of the
 * codebase's code-generation (visitCode, prescriptionCode, etc.).
 */
export async function getMaxReferralCodeNumber(): Promise<number> {
  const last = await prisma.referral.findFirst({
    orderBy: { referralCode: 'desc' },
    select: { referralCode: true },
  });
  if (!last?.referralCode) return 0;
  const match = last.referralCode.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}
