import { NextRequest, NextResponse, after } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';
import logger from '@/lib/logger';
import { sanitizeSearch } from '@/lib/utils';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { createPatientSchema, cleanPatientInput, nextPatientCode } from '@/lib/patient-schema';
import { logPatientChange, patientChanges } from './_lib/patient-audit';
import { SEGMENT_FLAG_KEYS } from '@/lib/patient-age-bands';

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  // Check permission to read patients
  const permissionCheck = await requirePermission(session, 'patients', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;

    const search = searchParams.get('search') || '';
    const sex = searchParams.get('sex') || '';
    const active = searchParams.get('active');
    const minAge = searchParams.get('minAge');
    const maxAge = searchParams.get('maxAge');
    const city = searchParams.get('city') || '';
    const state = searchParams.get('state') || '';
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const limit = searchParams.get('limit');
    const page = searchParams.get('page') || '1';

    // Only this clinic's patients; tenant-less legacy records and other clinics' patients
    // are never listed (the old `global=true` cross-clinic listing is no longer honoured).
    const filter: any = { tenantIds: tenantObjectId };

    if (search) {
      const safeSearch = sanitizeSearch(search);
      const searchRegex = new RegExp(safeSearch, 'i');
      let phoneCondition;
      if (/\d/.test(search)) {
        // If search contains digits, search phone by digits only
        const safeDigits = search.replace(/\D/g, '').slice(0, 20);
        phoneCondition = { phone: { $regex: safeDigits, $options: 'i' } };
      } else {
        phoneCondition = { phone: searchRegex };
      }
      filter.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { middleName: searchRegex },
        { email: searchRegex },
        phoneCondition,
        { patientCode: searchRegex },
        { 'address.city': searchRegex },
        { 'address.state': searchRegex },
      ];
    }

    if (sex && ['male', 'female', 'other'].includes(sex)) {
      filter.sex = sex;
    }

    if (active !== null && active !== undefined) {
      filter.active = active === 'true';
    }

    // Age range filter
    if (minAge || maxAge) {
      const now = new Date();
      if (maxAge) {
        const minDate = new Date(now.getFullYear() - (parseInt(maxAge) || 0) - 1, now.getMonth(), now.getDate());
        filter.dateOfBirth = { ...filter.dateOfBirth, $gte: minDate };
      }
      if (minAge) {
        const maxDate = new Date(now.getFullYear() - (parseInt(minAge) || 0), now.getMonth(), now.getDate());
        filter.dateOfBirth = { ...filter.dateOfBirth, $lte: maxDate };
      }
    }

    // Segmentation: any of the given tags, and every given segment flag.
    const tags = (searchParams.get('tags') || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20);
    if (tags.length) {
      filter.tags = { $in: tags };
    }
    const flags = (searchParams.get('flags') || '')
      .split(',')
      .filter((f): f is (typeof SEGMENT_FLAG_KEYS)[number] => (SEGMENT_FLAG_KEYS as readonly string[]).includes(f));
    for (const flag of flags) {
      filter[`segmentFlags.${flag}`] = true;
    }

    if (city) {
      filter['address.city'] = new RegExp(sanitizeSearch(city), 'i');
    }
    if (state) {
      filter['address.state'] = new RegExp(sanitizeSearch(state), 'i');
    }

    const direction = sortOrder === 'asc' ? 1 : -1;
    const sort: any = {};
    if (sortBy === 'name') {
      sort.lastName = direction;
      sort.firstName = direction;
    } else if (['dateOfBirth', 'patientCode', 'createdAt', 'updatedAt', 'lastName', 'firstName'].includes(sortBy)) {
      sort[sortBy] = direction;
    } else {
      sort.createdAt = direction;
    }

    // Pagination - use settings default if limit not provided
    const settings = await getSettings(tenantId);
    const defaultLimit = settings.generalSettings?.itemsPerPage || 20;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(500, Math.max(1, (limit ? parseInt(limit) : defaultLimit) || defaultLimit));
    const skip = (pageNum - 1) * limitNum;

    const [patients, total] = await Promise.all([
      // Files are inline data and include other clinics' uploads; the list never shows them.
      Patient.find(filter, { attachments: 0, readNotificationIds: 0 }).sort(sort).skip(skip).limit(limitNum).lean(),
      Patient.countDocuments(filter),
    ]);

    return NextResponse.json({
      success: true,
      data: patients,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    console.error('Error fetching patients:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch patients' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  // Check permission to write/create patients
  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();

    // One-time migration: drop the old compound multikey index { tenantIds, tags }
    // which caused MongoServerError 171 on every patient insert.
    // dropIndex is a no-op if the index doesn't exist.
    Patient.collection.dropIndex('tenantIds_1_tags_1').catch(() => { /* already gone */ });

    const { checkSubscriptionLimit } = await import('@/lib/subscription-limits');
    const limitCheck = await checkSubscriptionLimit(tenantId, 'createPatient');
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: limitCheck.reason || 'Subscription limit exceeded',
          limit: limitCheck.limit,
          current: limitCheck.current,
          remaining: limitCheck.remaining,
        },
        { status: 403 }
      );
    }

    const parsed = await parseBody(request, createPatientSchema);
    if (isValidationError(parsed)) return parsed;
    const data = cleanPatientInput(parsed.data);

    let patient: any;
    for (let attempt = 0; attempt < 3 && !patient; attempt++) {
      try {
        patient = await Patient.create({
          ...data,
          patientCode: await nextPatientCode(),
          tenantIds: [tenantObjectId],
        });
      } catch (createError: any) {
        // A legacy code the counter didn't know about; take the next number.
        if (createError.code === 11000 && createError.keyPattern?.patientCode) continue;
        throw createError;
      }
    }

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Failed to create patient. Please try again.' },
        { status: 500 }
      );
    }

    await logPatientChange(ctx, request, {
      action: 'create',
      patientId: patient._id,
      description: `Registered as ${patient.patientCode}`,
      changes: patientChanges({}, patient.toObject(), Object.keys(data)),
    });

    // The welcome text goes to the phone (always present) and the email only when there is one;
    // sendWelcomeMessage checks each channel and the clinic's autoWelcomeMessages setting.
    after(() =>
      import('@/lib/automations/welcome-messages').then(({ sendWelcomeMessage }) => {
        return sendWelcomeMessage({
          patientId: patient._id,
          tenantIds: [tenantId],
          sendSMS: true,
          sendEmail: true,
          sendNotification: false,
        }).catch((error) => {
          console.error('Error sending welcome message:', error);
        });
      }).catch((error) => {
        console.error('Error loading welcome messages module:', error);
      })
    );

    return NextResponse.json({ success: true, data: patient }, { status: 201 });
  } catch (error: any) {
    logger.error('Error creating patient', error as Error, {
      name: error.name,
      code: error.code,
    });

    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors || {}).map((err: any) => err.message).join(', ');
      return NextResponse.json(
        { success: false, error: validationErrors || 'Invalid patient data' },
        { status: 400 }
      );
    }
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Patient with this email already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create patient' },
      { status: 500 }
    );
  }
}
