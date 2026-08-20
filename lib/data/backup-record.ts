/**
 * Data-access layer for BackupRecord. DIRECTLY_SCOPED_MODEL in
 * lib/prisma-tenant-extension.ts. Every function assumes the caller has
 * already established tenant context via runWithTenant/runAsSystem.
 *
 * NOTE: this module only covers BackupRecord *bookkeeping* (metadata rows).
 * The actual backup/restore mechanism in app/api/backups/route.ts and
 * app/api/backups/[id]/restore/route.ts dumps/restores raw MongoDB
 * collections via the Mongo driver — that is genuine pre-cutover Mongo
 * infrastructure and is intentionally left untouched (see comments there).
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

export function toBackupRecordDTO(r: Prisma.BackupRecordGetPayload<{}>) {
  return { _id: r.id, ...r };
}

/** List backups (metadata only — `data` blob excluded to keep list responses small). */
export async function listBackupRecords(skip: number, take: number) {
  const [items, total] = await Promise.all([
    prisma.backupRecord.findMany({
      omit: { data: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.backupRecord.count(),
  ]);
  return { items: items.map((r) => ({ _id: r.id, ...r })), total };
}

export interface CreateBackupRecordInput {
  createdById: string;
  createdByEmail?: string;
  label?: string;
  status?: Prisma.BackupRecordCreateInput['status'];
  collections: string[];
  totalDocuments: number;
  sizeBytes: number;
  version?: string;
  data: Prisma.InputJsonValue;
}

export async function createBackupRecord(input: CreateBackupRecordInput) {
  const record = await prisma.backupRecord.create({
    data: {
      createdById: input.createdById,
      createdByEmail: input.createdByEmail,
      label: input.label,
      status: input.status ?? 'completed',
      collections: input.collections,
      totalDocuments: input.totalDocuments,
      sizeBytes: input.sizeBytes,
      version: input.version ?? '1.0',
      data: input.data,
    },
  });
  const { data, ...meta } = record;
  return toBackupRecordDTO(meta as Prisma.BackupRecordGetPayload<{}>);
}

/** Fetch a backup including its raw `data` blob (needed for download/restore). */
export async function getBackupRecordById(id: string) {
  const record = await prisma.backupRecord.findUnique({ where: { id } });
  return record ? toBackupRecordDTO(record) : null;
}

export async function deleteBackupRecord(id: string) {
  const record = await prisma.backupRecord.delete({ where: { id }, omit: { data: true } });
  return toBackupRecordDTO(record as Prisma.BackupRecordGetPayload<{}>);
}

export async function setBackupRecordStatus(
  id: string,
  status: Prisma.BackupRecordUpdateInput['status'],
  extra?: { restoredAt?: Date; restoredById?: string }
) {
  const record = await prisma.backupRecord.update({
    where: { id },
    data: {
      status,
      restoredAt: extra?.restoredAt,
      restoredBy: extra?.restoredById ? { connect: { id: extra.restoredById } } : undefined,
    },
    omit: { data: true },
  });
  return toBackupRecordDTO(record as Prisma.BackupRecordGetPayload<{}>);
}
