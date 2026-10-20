import 'server-only';
import { z } from 'zod';
import { SHORTCUT_RE, type ClinicalTemplateDTO } from '@/lib/clinical-templates';

const text = (max: number) => z.string().max(max).optional();

const medication = z.object({
  name: z.string().trim().min(1).max(200),
  genericName: text(200),
  form: text(100),
  strength: text(100),
  dosage: text(100),
  route: text(100),
  frequency: text(100),
  duration: text(100),
  quantity: z.number().finite().min(0).max(100000).optional(),
  instructions: text(500),
});

const visit = z.object({
  chiefComplaint: text(500),
  historyOfPresentIllness: text(4000),
  soapNotes: z
    .object({ subjective: text(4000), objective: text(4000), assessment: text(4000), plan: text(4000) })
    .optional(),
  physicalExam: z.record(z.string().max(40), z.string().max(1000)).optional(),
  diagnoses: z
    .array(z.object({ code: text(20), description: text(300), primary: z.boolean().optional() }))
    .max(20)
    .optional(),
  followUpInstructions: text(1000),
});

const base = {
  name: z.string().trim().min(1, 'Name the template.').max(80),
  specialty: z.string().trim().max(80).optional(),
  shared: z.boolean().optional(),
};

export const createTemplateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('visit'), ...base, visit, medications: z.array(medication).max(30).optional() }),
  z.object({ kind: z.literal('prescription'), ...base, medications: z.array(medication).min(1, 'Add at least one medicine.').max(30) }),
  z.object({
    kind: z.literal('phrase'),
    ...base,
    shortcut: z.string().trim().toLowerCase().regex(SHORTCUT_RE, 'Use 1–20 letters, numbers or dashes.'),
    text: z.string().min(1, 'Write the phrase.').max(4000),
  }),
]);

/** Updates may rename, share, and replace content; the kind never changes. */
export const updateTemplateSchema = z.object({
  ...base,
  name: base.name.optional(),
  shortcut: z.string().trim().toLowerCase().regex(SHORTCUT_RE, 'Use 1–20 letters, numbers or dashes.').optional(),
  text: z.string().min(1).max(4000).optional(),
  visit: visit.optional(),
  medications: z.array(medication).max(30).optional(),
});

type TemplateRow = {
  _id: { toString(): string };
  kind: ClinicalTemplateDTO['kind'];
  name: string;
  specialty?: string;
  shared?: boolean;
  ownerId: { toString(): string } | { _id: { toString(): string }; name?: string };
  shortcut?: string;
  text?: string;
  visit?: ClinicalTemplateDTO['visit'] & { physicalExam?: Record<string, string> | Map<string, string> };
  medications?: ClinicalTemplateDTO['medications'];
  usageCount?: number;
  lastUsedAt?: Date;
};

/** The owner's id, whether or not `ownerId` was populated. */
export function ownerIdOf(row: Pick<TemplateRow, 'ownerId'>): string {
  const owner = row.ownerId as { _id?: { toString(): string } };
  return owner?._id ? owner._id.toString() : row.ownerId.toString();
}

export function toDTO(row: TemplateRow, userId: string, admin: boolean): ClinicalTemplateDTO {
  const owner = row.ownerId as { name?: string };
  const mine = ownerIdOf(row) === userId;
  const pe = row.visit?.physicalExam;
  return {
    _id: row._id.toString(),
    kind: row.kind,
    name: row.name,
    specialty: row.specialty || undefined,
    shared: Boolean(row.shared),
    mine,
    canEdit: mine || (admin && Boolean(row.shared)),
    ownerName: owner?.name,
    shortcut: row.shortcut || undefined,
    text: row.text,
    visit: row.visit
      ? { ...row.visit, physicalExam: pe instanceof Map ? Object.fromEntries(pe) : pe }
      : undefined,
    medications: row.medications,
    usageCount: row.usageCount ?? 0,
    lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : undefined,
  };
}

export function duplicateShortcut(error: unknown): boolean {
  return (error as { code?: number })?.code === 11000;
}
