/**
 * Data-access layer for the Tenant model.
 *
 * Tenant is the tenant-scoping ROOT, not a tenant-scoped model — it is
 * intentionally absent from DIRECTLY_SCOPED_MODELS / JUNCTION_SCOPED_MODELS
 * in lib/prisma-tenant-extension.ts, so calls here pass straight through the
 * extension untouched regardless of AsyncLocalStorage state. Every function
 * below may be called from `runAsSystem(fn)` (cron/admin/onboarding code) or
 * even with no tenant context active at all. Do NOT wrap these calls in
 * runWithTenant() — there is no tenant to scope by, that's the whole point.
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

export function getTenantById(id: string) {
  return prisma.tenant.findUnique({ where: { id } });
}

export function getTenantBySubdomain(subdomain: string) {
  return prisma.tenant.findUnique({ where: { subdomain } });
}

export function createTenant(data: Prisma.TenantCreateInput) {
  return prisma.tenant.create({ data });
}

export function updateTenant(id: string, data: Prisma.TenantUpdateInput) {
  return prisma.tenant.update({ where: { id }, data });
}

export function listTenants(filter?: Prisma.TenantWhereInput) {
  return prisma.tenant.findMany({ where: filter, orderBy: { createdAt: 'desc' } });
}

export interface TenantDirectoryOptions {
  search?: string;
  city?: string;
  skip?: number;
  take?: number;
}

const directorySelect = {
  id: true,
  name: true,
  displayName: true,
  subdomain: true,
  addressCity: true,
  addressState: true,
  addressCountry: true,
  settingsLogo: true,
} satisfies Prisma.TenantSelect;

/**
 * Paginated, searchable directory of active tenants (app/api/tenants/directory).
 * Uses Postgres `contains`/`insensitive` instead of the Mongoose route's
 * manually-escaped RegExp — Prisma has no regex-injection surface here.
 */
export function listTenantDirectory(opts: TenantDirectoryOptions = {}) {
  const { search, city, skip, take } = opts;

  const where: Prisma.TenantWhereInput = { status: 'active' };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { displayName: { contains: search, mode: 'insensitive' } },
      { subdomain: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (city) {
    where.addressCity = { contains: city, mode: 'insensitive' };
  }

  return Promise.all([
    prisma.tenant.findMany({ where, select: directorySelect, orderBy: { name: 'asc' }, skip, take }),
    prisma.tenant.count({ where }),
  ]);
}

/** True if no tenant currently holds this subdomain. */
export async function isSubdomainAvailable(subdomain: string): Promise<boolean> {
  const existing = await prisma.tenant.findUnique({ where: { subdomain }, select: { id: true } });
  return !existing;
}

export interface ActivateSubscriptionInput {
  tenantId: string;
  plan: string;
  billingCycle: Prisma.TenantUpdateInput['subscriptionBillingCycle'];
  expiresAt: Date;
  renewalAt: Date;
  paypalOrderId: string;
  paymentHistory: {
    transactionId: string;
    orderId: string;
    amount: number;
    currency: string;
    payerEmail?: string;
    plan: string;
    billingCycle: Prisma.TenantPaymentHistoryCreateInput['billingCycle'];
    paidAt: Date;
  };
}

/**
 * Activate (or renew) a tenant's subscription and append a payment-history
 * row, replacing the Mongoose flow of pushing onto `subscription.paymentHistory`
 * and saving the tenant document. Runs as a single write; PaypalOrder status
 * bookkeeping is the caller's responsibility (lib/data/paypal-order.ts).
 */
export async function activateTenantSubscription(input: ActivateSubscriptionInput) {
  return prisma.tenant.update({
    where: { id: input.tenantId },
    data: {
      subscriptionPlan: input.plan,
      subscriptionStatus: 'active',
      subscriptionBillingCycle: input.billingCycle,
      subscriptionExpiresAt: input.expiresAt,
      subscriptionRenewalAt: input.renewalAt,
      subscriptionPaypalOrderId: input.paypalOrderId,
      paymentHistory: {
        create: {
          transactionId: input.paymentHistory.transactionId,
          orderId: input.paymentHistory.orderId,
          amount: input.paymentHistory.amount,
          currency: input.paymentHistory.currency,
          payerEmail: input.paymentHistory.payerEmail,
          plan: input.paymentHistory.plan,
          billingCycle: input.paymentHistory.billingCycle,
          status: 'completed',
          paidAt: input.paymentHistory.paidAt,
        },
      },
    },
  });
}
