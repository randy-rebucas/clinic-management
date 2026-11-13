import 'server-only';
import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import Product from '@/models/Product';
import { getClinicForReps, repMayBook } from '@/lib/rep-visits';
import { repProfileFilter, type RepSession } from './rep-session';

/** Most products one visit can carry. */
export const MAX_VISIT_PRODUCTS = 10;

export type RepProfileForVisits = {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  company?: string;
  tenantIds?: Types.ObjectId[];
  teamId?: Types.ObjectId;
  subscription?: { expiresAt?: Date };
};

export async function loadRepProfileForVisits(rep: RepSession): Promise<RepProfileForVisits | null> {
  return MedicalRepresentative.findOne(repProfileFilter(rep))
    .select('firstName lastName company tenantIds teamId subscription.expiresAt')
    .lean<RepProfileForVisits | null>();
}

export const repDisplayName = (p: RepProfileForVisits) => `${p.firstName} ${p.lastName}`.trim();

export function visitError(status: number, error: string, code?: string) {
  return NextResponse.json({ success: false, error, ...(code ? { code } : {}) }, { status });
}

/**
 * `productIds` from a request body: up to MAX_VISIT_PRODUCTS of the rep's own active products.
 * Ids already on the visit (`existing`) may stay even if the product has since gone inactive, so
 * an edit doesn't fail on something the rep didn't touch.
 * Undefined when the body leaves it out; a NextResponse when it is invalid.
 */
export async function resolveVisitProducts(
  rep: RepSession,
  raw: unknown,
  existing: unknown[] = []
): Promise<Types.ObjectId[] | undefined | NextResponse> {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw) || raw.length > MAX_VISIT_PRODUCTS || raw.some((id) => typeof id !== 'string' || !Types.ObjectId.isValid(id))) {
    return visitError(400, `productIds must be a list of up to ${MAX_VISIT_PRODUCTS} product ids.`);
  }
  const ids = [...new Set(raw as string[])].map((id) => new Types.ObjectId(id));
  if (!ids.length) return [];
  const kept = new Set(existing.map(String));
  const added = ids.filter((id) => !kept.has(String(id)));
  const owned = added.length ? await Product.countDocuments({ ...rep.ownerFilter, _id: { $in: added }, status: 'active' }) : 0;
  if (owned !== added.length) return visitError(400, 'Only your own active products can be added to a visit.', 'INVALID_PRODUCTS');
  return ids;
}

export type LinkedClinic = { id: Types.ObjectId; name: string; location: string };

/**
 * `linkedClinicId` on an own log entry: a clinic in the rep's directory (one they could book),
 * whose name and location then replace the typed ones. Undefined when the body leaves it out or
 * sends back the entry's current link (`existing`, kept even if the rep has since left that
 * clinic), null to unlink, a NextResponse (404) for a clinic the rep can't reach.
 */
export async function resolveLinkedClinic(
  rep: RepSession,
  raw: unknown,
  existing?: unknown
): Promise<LinkedClinic | null | undefined | NextResponse> {
  if (raw === undefined) return undefined;
  if (existing && typeof raw === 'string' && raw === String(existing)) return undefined;
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string' || !Types.ObjectId.isValid(raw)) return visitError(404, 'Clinic not found');
  const [profile, clinic] = await Promise.all([loadRepProfileForVisits(rep), getClinicForReps(raw)]);
  if (!profile || !clinic || !repMayBook(clinic, profile.tenantIds).allowed) return visitError(404, 'Clinic not found');
  return { id: new Types.ObjectId(clinic.id), name: clinic.name, location: clinic.location };
}
