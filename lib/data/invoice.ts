/**
 * Data-access layer for the Invoice model (Phase 5 Batch 5 — billing).
 * Invoice carries a direct `tenantId` column (DIRECTLY_SCOPED_MODELS in
 * lib/prisma-tenant-extension.ts) — standard runWithTenant(tenantId, fn)
 * scoping applies.
 *
 * Every function below assumes an active tenant context has already been
 * established by the caller. Functions here do not open their own context.
 *
 * Multi-table writes: lineItems / discounts / payments are all separate
 * child tables (see prisma/MIGRATION_NOTES.md's "Invoice" section).
 * createInvoice() uses Prisma's nested-write API (`data: { lineItems: {
 * create: [...] }, discounts: { create: [...] } }`) inside a single
 * `prisma.invoice.create()` call, matching lib/data/prescription.ts's
 * createPrescription pattern. recordPayment() reads the existing invoice +
 * its payments first to compute the new totalPaid/outstandingBalance/status
 * aggregate, then does a single `prisma.invoice.update()` combining a nested
 * `payments: { create }` with those new scalar fields — same atomicity
 * pattern as recordPharmacyDispense() in prescription.ts.
 *
 * Field mapping mirrors scripts/migrate-to-postgres/migrate.ts's
 * migrateInvoices(): lineItems <- items[], insurance.* flattened onto
 * insurance* columns. toInvoiceDTO() re-nests items/insurance/discounts
 * under their Mongoose-era keys for frontend compatibility (the old
 * Mongoose schema called the line items array `items`, not `lineItems`,
 * and had a nested `insurance` object).
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

export const invoiceInclude = {
  patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, email: true, phone: true, dateOfBirth: true, addressStreet: true, addressCity: true, addressState: true, addressZipCode: true } },
  visit: { select: { id: true, visitCode: true, date: true, visitType: true } },
  professionalFeeDoctor: { select: { id: true, firstName: true, lastName: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  lineItems: { include: { service: { select: { id: true, name: true, code: true, category: true, unitPrice: true } } } },
  discounts: { include: { appliedBy: { select: { id: true, name: true, email: true } } } },
  payments: { include: { processedBy: { select: { id: true, name: true, email: true } } } },
} satisfies Prisma.InvoiceInclude;

type InvoiceWithRelations = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

export function toInvoiceDTO(invoice: InvoiceWithRelations) {
  const {
    id,
    lineItems,
    insuranceProvider,
    insurancePolicyNumber,
    insuranceMemberId,
    insuranceCoverageType,
    insuranceCoverageAmount,
    insuranceClaimNumber,
    insuranceStatus,
    insuranceNotes,
    ...rest
  } = invoice;

  const hasInsurance = Boolean(insuranceProvider);

  return {
    _id: id,
    id,
    ...rest,
    items: lineItems.map((li) => ({ ...li, serviceId: li.service ?? li.serviceId })),
    insurance: hasInsurance
      ? {
          provider: insuranceProvider,
          policyNumber: insurancePolicyNumber ?? undefined,
          memberId: insuranceMemberId ?? undefined,
          coverageType: insuranceCoverageType ?? undefined,
          coverageAmount: insuranceCoverageAmount ?? undefined,
          claimNumber: insuranceClaimNumber ?? undefined,
          status: insuranceStatus ?? undefined,
          notes: insuranceNotes ?? undefined,
        }
      : undefined,
  };
}

/** Flatten nested API input (create or update body) into Prisma scalar columns. Relation arrays are handled separately by the caller. */
export function flattenInvoiceInput(body: Record<string, any>): Record<string, any> {
  const flat: Record<string, any> = { ...body };

  const insurance = body.insurance;
  if (insurance) {
    flat.insuranceProvider = insurance.provider ?? undefined;
    flat.insurancePolicyNumber = insurance.policyNumber ?? undefined;
    flat.insuranceMemberId = insurance.memberId ?? undefined;
    flat.insuranceCoverageType = insurance.coverageType ?? undefined;
    flat.insuranceCoverageAmount = insurance.coverageAmount ?? undefined;
    flat.insuranceClaimNumber = insurance.claimNumber ?? undefined;
    flat.insuranceStatus = insurance.status ?? undefined;
    flat.insuranceNotes = insurance.notes ?? undefined;
  }
  delete flat.insurance;

  delete flat.items;
  delete flat.lineItems;
  delete flat.discounts;
  delete flat.payments;
  delete flat.patient;
  delete flat.visit;
  delete flat.professionalFeeDoctor;
  delete flat.createdBy;
  delete flat.tenantId;
  delete flat.id;
  delete flat._id;
  delete flat.createdAt;
  delete flat.updatedAt;

  return flat;
}

function buildLineItemCreates(items: any[] | undefined): Prisma.InvoiceLineItemCreateWithoutInvoiceInput[] {
  if (!Array.isArray(items)) return [];
  return items.map((i) => ({
    serviceId: i.serviceId || undefined,
    code: i.code ?? undefined,
    description: i.description ?? undefined,
    category: i.category ?? undefined,
    quantity: i.quantity ?? 1,
    unitPrice: i.unitPrice ?? 0,
    total: i.total ?? 0,
  }));
}

function buildDiscountCreates(discounts: any[] | undefined): Prisma.InvoiceDiscountCreateWithoutInvoiceInput[] {
  if (!Array.isArray(discounts)) return [];
  return discounts.map((d) => ({
    type: d.type,
    reason: d.reason ?? undefined,
    percentage: d.percentage ?? undefined,
    amount: d.amount,
    appliedById: d.appliedBy || undefined,
  }));
}

export interface InvoiceFilter {
  patientId?: string;
  visitId?: string;
  status?: string;
}

export function buildInvoiceWhere(filter: InvoiceFilter): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = {};
  if (filter.patientId) where.patientId = filter.patientId;
  if (filter.visitId) where.visitId = filter.visitId;
  if (filter.status) where.status = filter.status as Prisma.InvoiceWhereInput['status'];
  return where;
}

export async function listInvoices(where: Prisma.InvoiceWhereInput) {
  const invoices = await prisma.invoice.findMany({
    where,
    include: invoiceInclude,
    orderBy: { createdAt: 'desc' },
  });
  return invoices.map(toInvoiceDTO);
}

export async function getInvoiceById(id: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: invoiceInclude });
  return invoice ? toInvoiceDTO(invoice) : null;
}

export function findInvoiceRawById(id: string) {
  return prisma.invoice.findUnique({ where: { id } });
}

/** Highest existing invoice number suffix, for auto-generation (tenant-scoped by the active context). */
export async function getMaxInvoiceNumber(): Promise<number> {
  const last = await prisma.invoice.findFirst({
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });
  if (!last?.invoiceNumber) return 0;
  const match = last.invoiceNumber.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

function computeTotals(items: any[], discounts: any[], professionalFee: number, tax: number) {
  const subtotal = items.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
  const discountTotal = discounts.reduce((sum: number, disc: any) => sum + (disc.amount || 0), 0);
  const afterDiscount = subtotal - discountTotal;
  const total = afterDiscount + professionalFee + tax;
  return { subtotal, total };
}

/**
 * Create an invoice with lineItems and discounts in one atomic nested-write
 * call (same pattern as createPrescription()).
 */
export async function createInvoice(
  body: Record<string, any>,
  refs: { patientId: string; visitId?: string; createdById?: string }
) {
  const flat = flattenInvoiceInput(body);
  const items = body.items ?? [];
  const discounts = body.discounts ?? [];
  const professionalFee = body.professionalFee || 0;
  const tax = body.tax || 0;
  const { subtotal, total } = computeTotals(items, discounts, professionalFee, tax);

  const invoice = await prisma.invoice.create({
    data: {
      ...flat,
      patient: { connect: { id: refs.patientId } },
      visit: refs.visitId ? { connect: { id: refs.visitId } } : undefined,
      createdBy: refs.createdById ? { connect: { id: refs.createdById } } : undefined,
      subtotal,
      total,
      outstandingBalance: total,
      totalPaid: 0,
      status: 'unpaid',
      lineItems: { create: buildLineItemCreates(items) },
      discounts: { create: buildDiscountCreates(discounts) },
      payments: { create: [] },
    } as Prisma.InvoiceCreateInput,
    include: invoiceInclude,
  });
  return toInvoiceDTO(invoice);
}

/**
 * Update an invoice's scalar/flattened fields. If items/discounts/
 * professionalFee/tax are present in the body, recompute subtotal/total/
 * outstandingBalance/status from the existing payments before writing —
 * matches the Mongoose-era PUT route's recalculation logic. lineItems and
 * discounts child rows themselves are not rewritten here (the legacy route
 * never replaced them on PUT either — it only mutated scalar fields).
 */
export async function updateInvoice(id: string, body: Record<string, any>) {
  const flat = flattenInvoiceInput(body);

  if (body.items || body.discounts || body.professionalFee !== undefined || body.tax !== undefined) {
    const current = await prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: { lineItems: true, discounts: true, payments: true },
    });
    const items = body.items ?? current.lineItems;
    const discounts = body.discounts ?? current.discounts;
    const professionalFee = body.professionalFee !== undefined ? body.professionalFee : (current.professionalFee || 0);
    const tax = body.tax !== undefined ? body.tax : (current.tax || 0);

    const { subtotal, total } = computeTotals(items, discounts, professionalFee, tax);
    const totalPaid = current.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const outstandingBalance = total - totalPaid;

    flat.subtotal = subtotal;
    flat.total = total;
    flat.totalPaid = totalPaid;
    flat.outstandingBalance = outstandingBalance;
    flat.status = outstandingBalance <= 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';
  }

  const invoice = await prisma.invoice.update({
    where: { id },
    data: flat as Prisma.InvoiceUpdateInput,
    include: invoiceInclude,
  });
  return toInvoiceDTO(invoice);
}

export async function deleteInvoice(id: string) {
  return prisma.invoice.delete({ where: { id } });
}

/**
 * Record a payment and recompute the totalPaid/outstandingBalance/status
 * aggregate in ONE atomic `prisma.invoice.update()` call: nested `payments:
 * { create }` plus the new scalar fields commit together, mirroring
 * recordPharmacyDispense()'s pattern in lib/data/prescription.ts.
 */
export async function recordPayment(
  id: string,
  payment: {
    method: string;
    amount: number;
    date?: Date;
    receiptNo?: string;
    referenceNo?: string;
    processedById?: string;
    notes?: string;
  }
) {
  const existing = await prisma.invoice.findUniqueOrThrow({
    where: { id },
    include: { payments: true },
  });

  const totalPaidSoFar = existing.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalPaid = totalPaidSoFar + (payment.amount || 0);
  const total = existing.total || 0;
  const outstandingBalance = total - totalPaid;

  let status: Prisma.InvoiceUpdateInput['status'] = 'unpaid';
  if (outstandingBalance <= 0) {
    status = 'paid';
  } else if (totalPaid > 0) {
    status = 'partial';
  }

  const invoice = await prisma.invoice.update({
    where: { id },
    data: {
      totalPaid,
      outstandingBalance,
      status,
      payments: {
        create: {
          method: payment.method as Prisma.InvoicePaymentCreateWithoutInvoiceInput['method'],
          amount: payment.amount,
          date: payment.date ?? new Date(),
          receiptNo: payment.receiptNo ?? undefined,
          referenceNo: payment.referenceNo ?? undefined,
          processedById: payment.processedById ?? undefined,
          notes: payment.notes ?? undefined,
        },
      },
    },
    include: invoiceInclude,
  });
  return toInvoiceDTO(invoice);
}

/**
 * Shared aggregation for "total outstanding balance across all invoices for
 * a patient". Both app/api/invoices/outstanding/route.ts and
 * app/api/patients/[id]/outstanding-balance/route.ts call this one
 * function rather than duplicating the query.
 */
// ── Automation / reporting support (lib/automations/*) ───────────────────────

export interface ReportDateRange {
  start: Date;
  end: Date;
}

/** Invoices created within a date range, with their payments — used by daily/periodic report generation. */
export function listInvoicesCreatedInRange(range: ReportDateRange) {
  return prisma.invoice.findMany({
    where: { createdAt: { gte: range.start, lte: range.end } },
    include: { payments: true },
  });
}

/** Invoices with a payment recorded within a date range (today's collected revenue). */
export function listInvoicesWithPaymentInRange(range: ReportDateRange) {
  return prisma.invoice.findMany({
    where: { payments: { some: { date: { gte: range.start, lte: range.end } } } },
    include: { payments: true },
  });
}

export function listOutstandingInvoicesRaw() {
  return prisma.invoice.findMany({ where: { status: { in: ['unpaid', 'partial'] } } });
}

export function countInvoicesCreatedInRange(range: ReportDateRange) {
  return prisma.invoice.count({ where: { createdAt: { gte: range.start, lte: range.end } } });
}

/** Invoices tied to a given set of visit ids (staff-performance revenue-by-doctor). */
export function listInvoicesForVisits(visitIds: string[]) {
  if (visitIds.length === 0) return Promise.resolve([]);
  return prisma.invoice.findMany({ where: { visitId: { in: visitIds } } });
}

export async function getOutstandingBalanceForPatient(patientId?: string) {
  const where: Prisma.InvoiceWhereInput = {
    status: { in: ['unpaid', 'partial'] },
  };
  if (patientId) where.patientId = patientId;

  const invoices = await prisma.invoice.findMany({
    where,
    include: invoiceInclude,
    orderBy: { createdAt: 'desc' },
  });

  const dtos = invoices.map(toInvoiceDTO);
  const totalOutstanding = dtos.reduce((sum, inv) => sum + (inv.outstandingBalance || 0), 0);

  return { invoices: dtos, totalOutstanding };
}
