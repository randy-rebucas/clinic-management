/**
 * Data-access layer for PaypalOrder. DIRECTLY_SCOPED_MODEL in
 * lib/prisma-tenant-extension.ts (tenantId is required/non-null here, unlike
 * most other models in this batch).
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

export function toPaypalOrderDTO(o: Prisma.PaypalOrderGetPayload<{}>) {
  return { _id: o.id, ...o };
}

export interface CreatePaypalOrderInput {
  orderId: string;
  plan: string;
  billingCycle: Prisma.PaypalOrderCreateInput['billingCycle'];
  amount: number;
  currency?: string;
  status?: Prisma.PaypalOrderCreateInput['status'];
}

export async function createPaypalOrder(input: CreatePaypalOrderInput) {
  const order = await prisma.paypalOrder.create({
    // tenantId is required in the schema but auto-stamped at runtime by the
    // tenant-scoping extension (create() on a directly-scoped model) — the
    // static Prisma type doesn't know that, hence the cast.
    data: {
      orderId: input.orderId,
      plan: input.plan,
      billingCycle: input.billingCycle,
      amount: input.amount,
      currency: input.currency ?? 'USD',
      status: input.status ?? 'pending',
    } as Prisma.PaypalOrderCreateInput,
  });
  return toPaypalOrderDTO(order);
}

export async function getPaypalOrderByOrderId(orderId: string) {
  const order = await prisma.paypalOrder.findUnique({ where: { orderId } });
  return order ? toPaypalOrderDTO(order) : null;
}

export async function updatePaypalOrderStatus(orderId: string, status: Prisma.PaypalOrderUpdateInput['status']) {
  const order = await prisma.paypalOrder.update({ where: { orderId }, data: { status } });
  return toPaypalOrderDTO(order);
}

/**
 * Atomically claim a pending order (pending -> processing) so concurrent
 * capture attempts (webhook + duplicate client call) can't double-process
 * it. Returns the claimed order, or null if no pending order matched
 * (already claimed / wrong tenant / unknown orderId).
 */
export async function claimPendingPaypalOrder(orderId: string, tenantId: string) {
  const result = await prisma.paypalOrder.updateMany({
    where: { orderId, tenantId, status: 'pending' },
    data: { status: 'processing' },
  });
  if (result.count === 0) return null;
  return getPaypalOrderByOrderId(orderId);
}
