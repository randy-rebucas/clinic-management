import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import { MedicalRepresentative, User } from '@/models';
import ClinicSponsorship from '@/models/ClinicSponsorship';
import RepAccessRequest from '@/models/RepAccessRequest';
import { notifyRepAddedByClinic } from '@/lib/rep-access';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { sanitizeSearch } from '@/lib/utils';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zEmail } from '@/lib/api/validate';
import { HIDDEN_REP_FIELDS, repForClinic } from './_lib/shared-rep';

const REP_STATUSES = ['active', 'inactive', 'on-leave'] as const;

// The UI may send company as { name } and territory as a list; both are stored as strings.
const companyField = z.union([
  z.string().trim().max(200),
  z.object({ name: z.string().trim().max(200).optional() }).transform((c) => c.name || ''),
]);
const territoryField = z.union([
  z.string().trim().max(500),
  z.array(z.string().trim().max(100)).max(50).transform((t) => t.join(', ')),
]);

const createRepSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: zEmail,
  phone: z.string().trim().max(30).optional(),
  company: companyField.optional(),
  territory: territoryField.optional(),
  products: z.array(z.string().trim().max(200)).max(50).optional(),
  notes: z.string().max(5000).optional(),
});

// GET /api/medical-representatives - Get all medical representatives
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { tenantObjectId } = ctx;

    await connectDB();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const company = searchParams.get('company');
    const search = searchParams.get('search');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50));
    const skip = (page - 1) * limit;

    // Reps can work with several clinics; membership is the `tenantIds` array.
    const query: Record<string, unknown> = { tenantIds: tenantObjectId };
    if (status && (REP_STATUSES as readonly string[]).includes(status)) query.status = status;
    if (company) query.company = { $regex: sanitizeSearch(company), $options: 'i' };
    if (search) {
      const safeSearch = sanitizeSearch(search);
      query.$or = [
        { firstName: { $regex: safeSearch, $options: 'i' } },
        { lastName: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
        { company: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const [representatives, total] = await Promise.all([
      MedicalRepresentative.find(query)
        .select(HIDDEN_REP_FIELDS)
        .populate('userId', 'name email status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MedicalRepresentative.countDocuments(query),
    ]);
    // The rep (if any) paying for this clinic's plan, to badge on the list.
    const sponsorRow = await ClinicSponsorship.findOne({ tenantId: tenantObjectId, status: 'accepted' }).select('repId').lean<{ repId: unknown } | null>();
    const sponsorId = sponsorRow ? String(sponsorRow.repId) : null;

    return NextResponse.json({
      success: true,
      data: representatives.map((rep) => ({
        ...repForClinic(rep as Record<string, unknown>, tenantObjectId),
        sponsoring: sponsorId !== null && String((rep as { _id: unknown })._id) === sponsorId,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error fetching medical representatives:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch medical representatives' }, { status: 500 });
  }
}

// POST /api/medical-representatives - Create a new medical representative
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { session, tenantObjectId } = ctx;

    if (!isAdmin(session)) {
      return refuseAccess(session, 'Admin access required', 'medical-representatives');
    }

    await connectDB();

    const parsed = await parseBody(request, createRepSchema);
    if (isValidationError(parsed)) return parsed;
    const { firstName, lastName, email, phone, company, territory, products, notes } = parsed.data;

    // A rep who already has an account (another clinic added them, or they signed up) is linked to
    // this clinic instead of refused. Their profile is theirs: the typed details don't replace it.
    const existingRep = await MedicalRepresentative.findOne({ email }).select('_id tenantIds').lean<{ _id: unknown; tenantIds?: unknown[] } | null>();
    if (existingRep) {
      if ((existingRep.tenantIds ?? []).some((t) => String(t) === String(tenantObjectId))) {
        return NextResponse.json({ success: false, error: 'This representative is already on your list.' }, { status: 400 });
      }
      const linked = await MedicalRepresentative.findOneAndUpdate(
        { _id: existingRep._id },
        { $addToSet: { tenantIds: tenantObjectId } },
        { new: true }
      )
        .select(HIDDEN_REP_FIELDS)
        .populate('userId', 'name email status')
        .lean<Record<string, unknown>>();
      // Any access request they had pending with this clinic is answered by this.
      await RepAccessRequest.updateMany(
        { tenantId: tenantObjectId, medicalRepresentativeId: existingRep._id, status: 'pending' },
        { $set: { status: 'approved', respondedAt: new Date(), respondedBy: session.userId } }
      );
      await notifyRepAddedByClinic(existingRep._id, tenantObjectId);
      return NextResponse.json({
        success: true,
        linked: true,
        data: linked ? repForClinic(linked, tenantObjectId) : null,
        message: 'This rep already has a MyClinicSoft account, so they were added to your list. They’ve been told.',
      });
    }

    // The model's post-save hook links any existing User with this email; refuse rather than
    // attach a clinic staff account to a rep profile.
    const existingUser = await User.findOne({ email }).select('_id').lean();
    if (existingUser) {
      return NextResponse.json({ success: false, error: 'A user with this email already exists' }, { status: 400 });
    }

    // Reps stay inactive until their activation payment completes (PayMongo checkout, applied in lib/paymongo-apply).
    const representative = await MedicalRepresentative.create({
      firstName,
      lastName,
      email,
      phone,
      company: company || '',
      territory: territory || '',
      products: products || [],
      notes,
      status: 'inactive',
      isActivated: false,
      paymentStatus: 'pending',
      tenantIds: [tenantObjectId],
    });

    await representative.populate('userId', 'name email status');

    return NextResponse.json({
      success: true,
      data: repForClinic(representative.toObject(), tenantObjectId),
      message: 'Medical representative created successfully',
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating medical representative:', error);
    if (error.code === 11000) {
      return NextResponse.json({ success: false, error: 'Medical representative with this email already exists' }, { status: 400 });
    }
    if (error.name === 'ValidationError') {
      return NextResponse.json({ success: false, error: 'Invalid medical representative data' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Failed to create medical representative' }, { status: 500 });
  }
}
