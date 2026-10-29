import 'server-only';
import type { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import Medicine from '@/models/Medicine';
import { createAuditLog } from '@/lib/audit';
import { tenantFilter, type TenantSession } from '@/lib/api/tenant-session';
import { STOCK_CATEGORIES } from '@/lib/inventory';

/**
 * How inventory items reach the audit log: an item added, its details changed, an item removed.
 * Stock going in and out (opening stock, restocks, adjustments, counts, dispensing) is not
 * copied here: the stock ledger records each one with who did it and why, and can't be edited.
 * Removing an item is logged with the stock it held, since its ledger goes with it from view.
 */

type Snapshot = Record<string, any>;
type Change = { field: string; oldValue: unknown; newValue: unknown };

/** Details compared on an edit, as the form names them. Quantity is the ledger's. */
const FIELDS: Record<string, string> = {
  name: 'name',
  category: 'category',
  sku: 'SKU',
  unit: 'unit',
  reorderLevel: 'reorder level',
  reorderQuantity: 'reorder quantity',
  unitCost: 'unit cost',
  supplier: 'supplier',
  location: 'location',
  expiryDate: 'expiry date',
  notes: 'notes',
  medicineId: 'linked medicine',
};

const blank = (v: unknown) => v === undefined || v === null || v === '';
const same = (a: unknown, b: unknown) => (blank(a) && blank(b)) || JSON.stringify(a) === JSON.stringify(b);
const idOf = (v: any) => (v && typeof v === 'object' && '_id' in v ? v._id : v);

const categoryWords = (v: unknown) => STOCK_CATEGORIES.find((c) => c.value === v)?.label ?? (blank(v) ? null : String(v));

/** "Nov 30, 2027". Expiry dates are calendar days stored at midnight UTC. */
const dateWords = (v: unknown) =>
  blank(v) ? null : new Date(v as string).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

async function medicineNames(tenantId: string, ids: unknown[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((v) => !blank(v)).map(String))].filter((id) => Types.ObjectId.isValid(id));
  if (!wanted.length) return new Map();
  const rows = await Medicine.find(tenantFilter(tenantId, { _id: { $in: wanted } })).select('name').lean<{ _id: unknown; name: string }[]>();
  return new Map(rows.map((r) => [String(r._id), r.name]));
}

/**
 * What changed between two versions of an item, for the fields given, values in words: the
 * category by its label, the medicine by name, dates as dates. Notes are named, not copied.
 */
export async function inventoryChanges(tenantId: string, before: Snapshot, after: Snapshot, fields: string[]): Promise<Change[]> {
  const changes: Change[] = [];
  for (const field of Object.keys(FIELDS)) {
    if (!fields.includes(field)) continue;
    const was = field === 'medicineId' ? idOf(before[field]) : before[field];
    const now = field === 'medicineId' ? idOf(after[field]) : after[field];
    if (field === 'expiryDate' ? dateWords(was) === dateWords(now) : same(was, now)) continue;
    changes.push({ field, oldValue: was ?? null, newValue: now ?? null });
  }

  const med = changes.find((c) => c.field === 'medicineId');
  const names = med ? await medicineNames(tenantId, [med.oldValue, med.newValue]) : new Map<string, string>();

  return changes.map((c) => {
    switch (c.field) {
      case 'category':
        return { ...c, oldValue: categoryWords(c.oldValue), newValue: categoryWords(c.newValue) };
      case 'expiryDate':
        return { ...c, oldValue: dateWords(c.oldValue), newValue: dateWords(c.newValue) };
      case 'notes':
        // Free text, up to pages long; the item keeps it.
        return { field: 'notes', oldValue: null, newValue: null };
      case 'medicineId': {
        const word = (v: unknown) => (blank(v) ? null : names.get(String(v)) ?? 'A medicine no longer on file');
        return { field: 'medicine', oldValue: word(c.oldValue), newValue: word(c.newValue) };
      }
      default:
        return c;
    }
  });
}

/** "Changed Paracetamol 500 mg: unit cost, reorder level". */
export function changedSentence(name: string, changes: Change[]) {
  const words = changes.map((c) => FIELDS[c.field] ?? (c.field === 'medicine' ? FIELDS.medicineId : c.field));
  return `Changed ${name}: ${words.join(', ')}`;
}

/** "120 tablets", "1 box", "0". */
export const stockWords = (quantity: number | undefined, unit?: string) =>
  `${(quantity ?? 0).toLocaleString('en-US')}${unit?.trim() ? ` ${unit.trim()}` : ''}`;

export async function logInventoryChange(
  ctx: TenantSession,
  request: NextRequest,
  entry: {
    action: 'create' | 'update' | 'delete';
    itemId: unknown;
    description: string;
    changes?: Change[];
    metadata?: Record<string, unknown>;
  }
) {
  await createAuditLog({
    userId: ctx.session.userId,
    userEmail: ctx.session.email,
    userRole: ctx.session.role,
    tenantId: ctx.tenantId,
    action: entry.action,
    resource: 'inventory',
    resourceId: String(entry.itemId),
    description: entry.description,
    changes: entry.changes?.length ? entry.changes : undefined,
    metadata: entry.metadata,
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
    requestMethod: request.method,
    requestPath: request.nextUrl.pathname,
  });
}
