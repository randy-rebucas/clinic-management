import 'server-only';
import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import Product from '@/models/Product';
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
 * Undefined when the body leaves it out; a NextResponse when it is invalid.
 */
export async function resolveVisitProducts(rep: RepSession, raw: unknown): Promise<Types.ObjectId[] | undefined | NextResponse> {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw) || raw.length > MAX_VISIT_PRODUCTS || raw.some((id) => typeof id !== 'string' || !Types.ObjectId.isValid(id))) {
    return visitError(400, `productIds must be a list of up to ${MAX_VISIT_PRODUCTS} product ids.`);
  }
  const ids = [...new Set(raw as string[])].map((id) => new Types.ObjectId(id));
  if (!ids.length) return [];
  const owned = await Product.countDocuments({ ...rep.ownerFilter, _id: { $in: ids }, status: 'active' });
  if (owned !== ids.length) return visitError(400, 'Only your own active products can be added to a visit.', 'INVALID_PRODUCTS');
  return ids;
}
