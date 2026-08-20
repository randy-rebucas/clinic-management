/**
 * Data-access layer for the PatientNote model.
 *
 * PatientNote is tenant-scoped directly (`tenantId` column, nullable) per
 * lib/prisma-tenant-extension.ts (DIRECTLY_SCOPED_MODELS). Every function
 * below assumes an active tenant context has already been established by
 * the caller via runWithTenant(tenantId, fn) or runAsSystem(fn) before
 * calling into this module. Functions here do not open their own context.
 *
 * Author info (author.userId/name/role in Mongoose) is a denormalized
 * snapshot flattened to authorUserId/authorName/authorRole columns — see
 * prisma/schema.prisma. toNoteDTO() re-nests it back to `author: {...}` to
 * match the shape routes/frontend expect.
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

function toNoteDTO<T extends { authorUserId: string; authorName: string; authorRole: string }>(note: T) {
  const { authorUserId, authorName, authorRole, ...rest } = note;
  return {
    ...rest,
    author: { userId: authorUserId, name: authorName, role: authorRole },
  };
}

export interface ListPatientNotesOptions {
  visibility?: 'private' | 'internal' | 'shared' | Array<'private' | 'internal' | 'shared'>;
  limit?: number;
  skip?: number;
}

export async function listPatientNotes(patientId: string, opts: ListPatientNotesOptions = {}) {
  const { visibility, limit = 50, skip = 0 } = opts;

  const where: Prisma.PatientNoteWhereInput = { patientId };
  if (visibility) {
    where.visibility = Array.isArray(visibility) ? { in: visibility } : visibility;
  }

  const [notes, total] = await Promise.all([
    prisma.patientNote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
    }),
    prisma.patientNote.count({ where }),
  ]);

  return { notes: notes.map(toNoteDTO), total };
}

export interface CreatePatientNoteInput {
  patientId: string;
  authorUserId: string;
  authorName: string;
  authorRole: string;
  content: string;
  visibility?: 'private' | 'internal' | 'shared';
  priority?: 'low' | 'normal' | 'high';
  tags?: string[];
  tenantId?: string | null;
}

export async function createPatientNote(input: CreatePatientNoteInput) {
  const note = await prisma.patientNote.create({
    data: {
      patientId: input.patientId,
      authorUserId: input.authorUserId,
      authorName: input.authorName,
      authorRole: input.authorRole,
      content: input.content,
      visibility: input.visibility ?? 'internal',
      priority: input.priority ?? 'normal',
      tags: input.tags ?? [],
      tenantId: input.tenantId ?? undefined,
    },
  });
  return toNoteDTO(note);
}

export async function getPatientNote(noteId: string, patientId: string) {
  const note = await prisma.patientNote.findFirst({ where: { id: noteId, patientId } });
  return note ? toNoteDTO(note) : null;
}

export interface UpdatePatientNoteInput {
  content?: string;
  visibility?: 'private' | 'internal' | 'shared';
  priority?: 'low' | 'normal' | 'high';
  tags?: string[];
}

export async function updatePatientNote(noteId: string, patientId: string, updates: UpdatePatientNoteInput) {
  const result = await prisma.patientNote.updateMany({
    where: { id: noteId, patientId },
    data: updates,
  });
  if (result.count === 0) return null;
  return getPatientNote(noteId, patientId);
}

export async function deletePatientNote(noteId: string, patientId: string) {
  const result = await prisma.patientNote.deleteMany({ where: { id: noteId, patientId } });
  return result.count > 0;
}
