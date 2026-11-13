import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import Product from '@/models/Product';
import RepDelivery, { REP_DELIVERY_KINDS, REP_DELIVERY_STATUSES } from '@/models/RepDelivery';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { deliveryClinicOf, MAX_DELIVERY_LINES, notifyClinicOfDelivery } from '@/lib/rep-deliveries';
import { getClinicForReps, repMayBook } from '@/lib/rep-visits';
import { repBookingAccess } from '@/lib/rep-billing';
import { requireRepSession, isRepSessionError } from '../_lib/rep-session';
import { loadRepProfileForVisits, repDisplayName, visitError } from '../_lib/rep-visit-input';

/**
 * GET /api/medical-representatives/deliveries
 * The rep's deliveries, newest first. Filters: visitId, productId (deliveries with that product,
 * for "where it is"), clinicId, status. Paginated: page (default 1), limit (default 50, max 100).
 */
export async function GET(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50', 10) || 50));

    const query: Record<string, unknown> = { ...rep.ownerFilter };
    for (const [param, field] of [['visitId', 'visitId'], ['productId', 'lines.productId'], ['clinicId', 'clinicId']] as const) {
      const value = sp.get(param);
      if (!value) continue;
      if (!isValidId(value)) return NextResponse.json({ success: false, error: `Invalid ${param}.` }, { status: 400 });
      query[field] = new Types.ObjectId(value);
    }
    const status = sp.get('status');
    if (status) {
      if (!(REP_DELIVERY_STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json({ success: false, error: 'Invalid status value.' }, { status: 400 });
      }
      query.status = status;
    }

    await connectDB();
    const [deliveries, total] = await Promise.all([
      RepDelivery.find(query)
        .select('-tenantId -respondedBy')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      RepDelivery.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: deliveries,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Get rep deliveries error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

const createSchema = z.object({
  visitId: z.string().refine(isValidId, 'Invalid visitId.'),
  kind: z.enum(REP_DELIVERY_KINDS),
  lines: z
    .array(
      z.object({
        productId: z.string().refine(isValidId, 'Invalid productId.'),
        quantity: z.number().int().min(1).max(100000),
        unit: z.string().trim().min(1).max(50),
        lotNumber: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().trim().max(60).optional()),
        expiryDate: z.preprocess(
          (v) => (v === '' || v === null ? undefined : v),
          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expiryDate must be YYYY-MM-DD.').optional()
        ),
      })
    )
    .min(1)
    .max(MAX_DELIVERY_LINES),
  note: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().trim().max(1000).optional()),
});

/**
 * POST /api/medical-representatives/deliveries
 * { visitId, kind: "sample" | "delivery", lines: [{ productId, quantity, unit, lotNumber?, expiryDate? }], note? }
 * Records what the rep left at the visit's clinic. The visit must be an approved or completed
 * booking, or an own log entry linked to a clinic the rep may still use (409 VISIT_CANT_DELIVER
 * otherwise), by a rep with an active subscription (402 SUBSCRIPTION_REQUIRED). Products are the
 * rep's own active ones; a line without an expiry takes the
 * product's. The clinic is told and confirms receipt.
 */
export async function POST(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    const parsed = await parseBody(request, createSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    await connectDB();
    const visit = await MedicalRepresentativeVisit.findOne({ ...rep.ownerFilter, _id: body.visitId })
      .select('clinicId linkedClinicId clinicName status')
      .lean<{ _id: Types.ObjectId; clinicId?: Types.ObjectId; linkedClinicId?: Types.ObjectId; clinicName: string; status: string } | null>();
    if (!visit) return notFound('Visit');
    const clinicId = deliveryClinicOf(visit);
    if (!clinicId) {
      return visitError(
        409,
        'Deliveries go with an approved or completed clinic visit, or a logged visit linked to a clinic.',
        'VISIT_CANT_DELIVER'
      );
    }

    const ids = [...new Set(body.lines.map((l) => l.productId))].map((id) => new Types.ObjectId(id));
    const products = await Product.find({ ...rep.ownerFilter, _id: { $in: ids }, status: 'active' })
      .select('name strength expiryDate packSize')
      .lean<{ _id: Types.ObjectId; name: string; strength?: string; expiryDate?: Date; packSize?: { count: number; unit: string } }[]>();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    if (byId.size !== ids.length) return visitError(400, 'Products must be your own active products.', 'INVALID_PRODUCTS');

    const profile = await loadRepProfileForVisits(rep);
    if (!profile) return notFound('Representative');
    // The visit may predate the clinic dropping the rep (or the rep leaving its list).
    const clinic = await getClinicForReps(clinicId);
    if (!clinic || !repMayBook(clinic, profile.tenantIds).allowed) {
      return visitError(409, 'This clinic no longer takes deliveries from you.', 'VISIT_CANT_DELIVER');
    }
    // Deliveries are part of the paid rep plan, like booking (free while the plan costs nothing).
    if (!(await repBookingAccess(profile)).ok) {
      return visitError(402, 'Recording deliveries needs an active rep subscription.', 'SUBSCRIPTION_REQUIRED');
    }

    const delivery = await RepDelivery.create({
      ...rep.ownerFilter,
      medicalRepresentativeId: profile._id,
      repName: repDisplayName(profile),
      repCompany: profile.company,
      clinicId,
      clinicName: visit.clinicName,
      visitId: visit._id,
      kind: body.kind,
      note: body.note,
      lines: body.lines.map((l) => {
        const p = byId.get(l.productId)!;
        return {
          productId: p._id,
          productName: p.name,
          strength: p.strength,
          quantity: l.quantity,
          unit: l.unit,
          lotNumber: l.lotNumber,
          expiryDate: l.expiryDate ? new Date(`${l.expiryDate}T00:00:00.000Z`) : p.expiryDate,
          ...(p.packSize?.count ? { packSize: p.packSize } : {}),
        };
      }),
    });

    await notifyClinicOfDelivery(delivery);

    const data = delivery.toObject();
    delete data.tenantId;
    return NextResponse.json({ success: true, message: 'Delivery recorded. The clinic will confirm it.', data });
  } catch (error) {
    console.error('Create rep delivery error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
