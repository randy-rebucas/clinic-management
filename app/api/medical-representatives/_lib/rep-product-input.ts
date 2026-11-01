import 'server-only';

export const VALID_PRODUCT_STATUSES = ['active', 'discontinued', 'inactive'] as const;
export type ProductStatus = (typeof VALID_PRODUCT_STATUSES)[number];

/** Most rows one import may carry. */
export const MAX_IMPORT_ROWS = 200;

export type RepProductInput = {
  name: string;
  category: string;
  manufacturer: string;
  description: string;
  dosage?: string;
  strength?: string;
  packaging: string;
  expiryDate: Date;
  status: ProductStatus;
  packSize?: { count: number; unit: string };
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * `packSize: { count, unit }` ("30 tablets"): undefined when left out or null, false when it is
 * there but not a whole count of 1–10000 with a unit of up to 50 characters.
 */
export function readPackSize(raw: unknown): { count: number; unit: string } | undefined | false {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') return false;
  const { count, unit } = raw as Record<string, unknown>;
  const n = typeof count === 'number' ? count : Number(count);
  const u = str(unit);
  if (!Number.isInteger(n) || n < 1 || n > 10000 || !u || u.length > 50) return false;
  return { count: n, unit: u };
}

/**
 * A new product from a request body (POST /products, and each row of POST /products/import):
 * the required fields, length limits, status and a parseable expiry date.
 */
export function readProductInput(body: Record<string, unknown>): { ok: true; value: RepProductInput } | { ok: false; error: string } {
  const name = str(body.name);
  const category = str(body.category);
  const manufacturer = str(body.manufacturer);
  const description = str(body.description);
  const packaging = str(body.packaging);
  const expiryDate = str(body.expiryDate);
  const dosage = typeof body.dosage === 'string' ? body.dosage.trim() : undefined;
  const strength = typeof body.strength === 'string' ? body.strength.trim() : undefined;
  const status = typeof body.status === 'string' && body.status.trim() ? body.status.trim() : 'active';

  if (!name || !category || !manufacturer || !description || !packaging || !expiryDate) {
    return { ok: false, error: 'Missing required fields' };
  }

  if (name.length > 200 || category.length > 100 || manufacturer.length > 200 ||
      description.length > 2000 || packaging.length > 200 ||
      (dosage?.length ?? 0) > 200 || (strength?.length ?? 0) > 200) {
    return { ok: false, error: 'One or more fields exceed maximum length.' };
  }

  if (!VALID_PRODUCT_STATUSES.includes(status as ProductStatus)) {
    return { ok: false, error: 'Invalid status value.' };
  }

  const parsedExpiry = new Date(expiryDate);
  if (isNaN(parsedExpiry.getTime())) {
    return { ok: false, error: 'Invalid expiry date.' };
  }

  const packSize = readPackSize(body.packSize);
  if (packSize === false) return { ok: false, error: 'Invalid pack size.' };

  return {
    ok: true,
    value: {
      name,
      category,
      manufacturer,
      description,
      dosage: dosage || undefined,
      strength: strength || undefined,
      packaging,
      expiryDate: parsedExpiry,
      status: status as ProductStatus,
      ...(packSize ? { packSize } : {}),
    },
  };
}

/** Same product for import de-duplication: name and strength, ignoring case and spacing. */
export function productKey(p: { name: string; strength?: string | null }): string {
  const norm = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return `${norm(p.name)}|${norm(p.strength)}`;
}
