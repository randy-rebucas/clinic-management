/**
 * Data-access layer for SupportRequest. DIRECTLY_SCOPED_MODEL in
 * lib/prisma-tenant-extension.ts. Every function assumes the caller has
 * already established tenant context via runWithTenant/runAsSystem.
 *
 * SupportStatus uses Prisma @map() to keep the hyphenated 'in-progress' DB
 * value; the JS enum member is `in_progress`.
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

const toDbEnum = (v: string | undefined) => (v ? v.replace(/-/g, '_') : v);
const fromDbEnum = (v: string | undefined | null) => (v ? v.replace(/_/g, '-') : v);

export function toSupportRequestDTO(r: Prisma.SupportRequestGetPayload<{}>) {
  return { _id: r.id, ...r, status: fromDbEnum(r.status) as string };
}

export interface CreateSupportRequestInput {
  userId?: string;
  email: string;
  subject: string;
  category?: Prisma.SupportRequestCreateInput['category'];
  message: string;
}

export async function createSupportRequest(input: CreateSupportRequestInput) {
  const r = await prisma.supportRequest.create({
    data: {
      userId: input.userId,
      email: input.email,
      subject: input.subject,
      category: input.category ?? 'general',
      message: input.message,
      status: 'open',
    },
  });
  return toSupportRequestDTO(r);
}

export async function listSupportRequests(where: Prisma.SupportRequestWhereInput = {}) {
  const items = await prisma.supportRequest.findMany({ where, orderBy: { createdAt: 'desc' } });
  return items.map(toSupportRequestDTO);
}
