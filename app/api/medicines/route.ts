import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Medicine from '@/models/Medicine';
import { sanitizeSearch } from '@/lib/utils';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, escapeRegex } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { isMedicineForm, unitOf } from '@/lib/medicines';
import { medicineCreateSchema } from './schema';

/**
 * GET: the medicines list, for the pickers (prescription form, stock items) and searches.
 * `active=false` lists medicines taken off the list, `active=all` both; anything else what is
 * on it. `form` narrows by form (it used to be sent and ignored). At most 100, by name.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');
    const category = searchParams.get('category');
    const form = searchParams.get('form');
    const active = searchParams.get('active');

    const query: Record<string, unknown> = tenantFilter(ctx.tenantId);

    if (active === 'false') query.active = false;
    else if (active !== 'all') query.active = true;
    if (category) query.category = String(category);
    if (isMedicineForm(form)) query.form = form;
    if (search) {
      const safeSearch = sanitizeSearch(search);
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { genericName: { $regex: safeSearch, $options: 'i' } },
        { brandNames: { $in: [new RegExp(safeSearch, 'i')] } },
      ];
    }

    const medicines = await Medicine.find(query)
      .sort({ name: 1 })
      .limit(100)
      .lean();

    return NextResponse.json({ success: true, data: medicines });
  } catch (error: any) {
    console.error('Error fetching medicines:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch medicines' },
      { status: 500 }
    );
  }
}

/**
 * POST: add a medicine. Needs medicines:write (administrators always). The unit is read from
 * the strength; a name already on file (on or off the list) is refused with its id. Audited.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session } = ctx;

  const permissionCheck = await requirePermission(session, 'medicines', 'write');
  if (permissionCheck) return permissionCheck;

  const parsed = await parseBody(request, medicineCreateSchema);
  if (isValidationError(parsed)) return parsed;
  const body: Record<string, unknown> = { ...parsed.data, unit: unitOf(parsed.data.strength) };
  for (const key of ['genericName', 'standardDosage', 'standardFrequency', 'duration', 'schedule'] as const) {
    if (body[key] === '') delete body[key];
  }
  if (!parsed.data.controlledSubstance) delete body.schedule;

  try {
    await connectDB();

    const existing = await Medicine.findOne(
      tenantFilter(ctx.tenantId, { name: new RegExp(`^${escapeRegex(parsed.data.name)}$`, 'i') })
    )
      .select('_id name active')
      .lean<{ _id: unknown; name: string; active: boolean } | null>();
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: existing.active
            ? `${existing.name} is already on the list.`
            : `${existing.name} was taken off the list. Put it back instead of adding it again.`,
          existingId: String(existing._id),
        },
        { status: 409 }
      );
    }

    const medicine = await Medicine.create({ ...body, tenantId: ctx.tenantObjectId });

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId: ctx.tenantId,
      action: 'create',
      resource: 'medicine',
      resourceId: String(medicine._id),
      description: `Added ${medicine.name} (${medicine.strength}) to the medicines list`,
    });

    return NextResponse.json({
      success: true,
      data: medicine,
      message: 'Medicine created successfully'
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating medicine:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid medicine data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create medicine' },
      { status: 500 }
    );
  }
}
