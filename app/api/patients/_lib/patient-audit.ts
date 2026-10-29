import type { NextRequest } from 'next/server';
import { createAuditLog } from '@/lib/audit';
import type { TenantSession } from '@/lib/api/tenant-session';

/**
 * How changes to a patient's record reach the audit log. Every entry names the patient as the
 * data subject (PH DPA), so the log can be narrowed to "entries about them".
 *
 * Name, contact and demographic fields are logged with their before and after values. Health
 * information (history, conditions, allergies, immunizations, social and family history) is
 * logged as changed without its contents: the record keeps it, and the log and its archives
 * shouldn't hold a second copy. ID numbers are masked to their last four characters.
 */

type Snapshot = Record<string, any>;
type Change = { field: string; oldValue: unknown; newValue: unknown };

const HEALTH_FIELDS = new Set([
  'medicalHistory', 'preExistingConditions', 'allergies', 'immunizations', 'socialHistory', 'familyHistory',
]);
const HEALTH_NOTE = 'Health information, not copied to the log';

const MASKED = /^identifiers\.|idNumber$|membershipNumber$/;

/** "Juan Dela Cruz". */
export const patientLabel = (p: { firstName?: string; middleName?: string; lastName?: string; suffix?: string }) =>
  [p.firstName, p.lastName, p.suffix].filter(Boolean).join(' ').trim() || 'Unnamed patient';

const blank = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || (v instanceof Map && v.size === 0);

const isPlain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof Map) && !('_bsontype' in (v as object));

/** Comparable form: dates as days, ids as strings, sub-document ids dropped. */
function normal(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v instanceof Map) return normal(Object.fromEntries(v));
  if (v && typeof v === 'object' && '_bsontype' in (v as object)) return String(v);
  if (Array.isArray(v)) return v.map(normal);
  if (isPlain(v)) {
    return Object.fromEntries(Object.entries(v).filter(([k, x]) => k !== '_id' && !blank(x)).map(([k, x]) => [k, normal(x)]));
  }
  return v;
}

/** Leaf paths of a grouped field: { address: { city } } → "address.city". */
function leaves(value: unknown, path: string, out: Map<string, unknown>) {
  if (isPlain(value)) {
    for (const [k, v] of Object.entries(value)) if (k !== '_id') leaves(v, `${path}.${k}`, out);
  } else if (!blank(value)) {
    out.set(path, normal(value));
  }
  return out;
}

const mask = (v: unknown) => {
  if (blank(v)) return null;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 4 ? `•••• ${s.slice(-4)}` : '••••';
};

const shown = (path: string, v: unknown) => (blank(v) ? null : MASKED.test(path) ? mask(v) : v);

/**
 * What changed between two versions of a patient's record. Only the top-level fields named in
 * `fields` are compared (the ones a request sent).
 */
export function patientChanges(before: Snapshot, after: Snapshot, fields: Iterable<string>): Change[] {
  const changes: Change[] = [];
  for (const field of new Set(fields)) {
    if (HEALTH_FIELDS.has(field)) {
      const was = normal(before[field]);
      const now = normal(after[field]);
      if (blank(was) && blank(now)) continue;
      if (JSON.stringify(was) !== JSON.stringify(now)) changes.push({ field, oldValue: HEALTH_NOTE, newValue: HEALTH_NOTE });
      continue;
    }
    const was = leaves(before[field], field, new Map());
    const now = leaves(after[field], field, new Map());
    for (const path of new Set([...was.keys(), ...now.keys()])) {
      const a = was.get(path);
      const b = now.get(path);
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      changes.push({ field: path, oldValue: shown(path, a), newValue: shown(path, b) });
    }
  }
  return changes;
}

/** "phone, address.city, allergies" → "phone, address, allergies" for a sentence. */
export const changedFields = (changes: Change[]) => [...new Set(changes.map((c) => c.field.split('.')[0]))].join(', ');

export async function logPatientChange(
  ctx: TenantSession,
  request: NextRequest,
  entry: {
    /** create and delete are the record itself; anything on it (notes, files) is an update. */
    action: 'create' | 'update' | 'delete';
    patientId: unknown;
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
    resource: 'patient',
    resourceId: String(entry.patientId),
    dataSubject: String(entry.patientId),
    isSensitive: true,
    description: entry.description,
    changes: entry.changes?.length ? entry.changes : undefined,
    metadata: entry.metadata,
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
    requestMethod: request.method,
    requestPath: request.nextUrl.pathname,
  });
}
