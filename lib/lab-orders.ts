import { Types } from 'mongoose';
import LabResult from '@/models/LabResult';

/** One test of a lab order, as printed on the order's request form. */
export interface OrderTestLine {
  _id: Types.ObjectId;
  requestCode?: string;
  status?: string;
  request?: { testType?: string; testCode?: string; description?: string; urgency?: string };
}

/**
 * True for a test placed as part of a multi-test order (request code LAB-000123-2 under order
 * LAB-000123). Tests grouped afterwards by scripts/migrate-lab-order-codes.ts keep their own codes
 * (LAB-000004, LAB-000005…) and were printed and sealed one by one, so they stay single-test forms.
 */
export function placedAsOrder(lab: { orderCode?: string | null; requestCode?: string | null }): boolean {
  return Boolean(lab.orderCode && lab.requestCode && lab.requestCode.startsWith(`${lab.orderCode}-`));
}

/**
 * The tests still live (not cancelled) on a lab's order, sorted by request code
 * (LAB-000123-1, -2…). Empty unless the lab was placed as part of a multi-test order, so
 * single-test and migrated forms print and seal exactly as before.
 */
export async function liveOrderTests(
  lab: { orderCode?: string | null; requestCode?: string | null; tenantId?: unknown },
  tenantId?: string | Types.ObjectId | null
): Promise<OrderTestLine[]> {
  if (!placedAsOrder(lab)) return [];
  const tid = tenantId ?? (lab.tenantId as Types.ObjectId | undefined);
  const tests = await LabResult.find({
    ...(tid ? { tenantId: new Types.ObjectId(String(tid)) } : {}),
    orderCode: lab.orderCode,
  })
    .select('requestCode status request.testType request.testCode request.description request.urgency')
    .limit(50)
    .lean<OrderTestLine[]>();
  if (tests.length < 2) return [];
  return tests
    .filter((t) => t.status !== 'cancelled')
    .sort((a, b) => String(a.requestCode ?? '').localeCompare(String(b.requestCode ?? ''), undefined, { numeric: true }));
}
