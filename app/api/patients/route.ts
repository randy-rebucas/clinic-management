import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';
import logger from '@/lib/logger';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { sanitizeSearch } from '@/lib/utils';
import {
  listPatients,
  createPatient,
  getMaxPatientCodeNumber,
  patientCodeExists,
} from '@/lib/data/patient';
import type { Prisma } from '@prisma/client';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'patients', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

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
    const isGlobal = searchParams.get('global') === 'true';

    const where: Prisma.PatientWhereInput = {};

    if (search) {
      const safeSearch = sanitizeSearch(search);
      const insensitive = { contains: safeSearch, mode: 'insensitive' as const };
      const phoneOr: Prisma.PatientWhereInput[] = /\d/.test(search)
        ? [{ phone: { contains: search.replace(/\D/g, '').slice(0, 20) } }]
        : [{ phone: insensitive }];

      where.OR = [
        { firstName: insensitive },
        { lastName: insensitive },
        { middleName: insensitive },
        { email: insensitive },
        ...phoneOr,
        { patientCode: insensitive },
        { addressCity: insensitive },
        { addressState: insensitive },
      ];
    }

    if (sex && sex !== 'all') {
      where.sex = sex as Prisma.PatientWhereInput['sex'];
    }

    if (active !== null && active !== undefined) {
      where.active = active === 'true';
    }

    if (minAge || maxAge) {
      const now = new Date();
      const dob: Prisma.DateTimeFilter = {};
      if (maxAge) {
        dob.gte = new Date(now.getFullYear() - parseInt(maxAge) - 1, now.getMonth(), now.getDate());
      }
      if (minAge) {
        dob.lte = new Date(now.getFullYear() - parseInt(minAge), now.getMonth(), now.getDate());
      }
      where.dateOfBirth = dob;
    }

    if (city) {
      where.addressCity = { contains: city, mode: 'insensitive' };
    }
    if (state) {
      where.addressState = { contains: state, mode: 'insensitive' };
    }

    const orderBy: Prisma.PatientOrderByWithRelationInput = {};
    if (sortBy === 'name') {
      // Prisma orderBy doesn't support compound multi-field the same way as Mongo sort objects;
      // approximate with lastName as primary sort key.
      orderBy.lastName = sortOrder === 'asc' ? 'asc' : 'desc';
    } else if (sortBy === 'dateOfBirth') {
      orderBy.dateOfBirth = sortOrder === 'asc' ? 'asc' : 'desc';
    } else if (sortBy === 'patientCode') {
      orderBy.patientCode = sortOrder === 'asc' ? 'asc' : 'desc';
    } else {
      (orderBy as any)[sortBy] = sortOrder === 'asc' ? 'asc' : 'desc';
    }

    const settings = await getSettings();
    const defaultLimit = settings.generalSettings?.itemsPerPage || 20;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(500, Math.max(1, limit ? parseInt(limit) : defaultLimit));
    const skip = (pageNum - 1) * limitNum;

    // Junction scoping (JUNCTION_SCOPED_MODELS.Patient) already restricts to
    // the active tenant automatically; `global=true` bypasses tenant scoping
    // by running the query via runAsSystem() instead.
    const { patients, total } = isGlobal
      ? await runAsSystem(() => listPatients(where, { skip, take: limitNum, orderBy }))
      : await run(tenantId, () => listPatients(where, { skip, take: limitNum, orderBy }));

    return NextResponse.json({
      success: true,
      data: patients,
      pagination: limitNum
        ? {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum),
          }
        : undefined,
    });
  } catch (error: any) {
    console.error('Error fetching patients:', error);
    const errorMessage = error?.message || 'Failed to fetch patients';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    if (tenantId) {
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
    }

    const body = await request.json();

    if (body.email === '') delete body.email;
    if (body.middleName === '' || body.middleName === null) delete body.middleName;
    if (body.suffix === '' || body.suffix === null) delete body.suffix;
    if (body.civilStatus === '' || body.civilStatus === null) delete body.civilStatus;
    if (body.nationality === '' || body.nationality === null) delete body.nationality;
    if (body.occupation === '' || body.occupation === null) delete body.occupation;
    if (body.medicalHistory === '' || body.medicalHistory === null) delete body.medicalHistory;
    if (body.preExistingConditions && Array.isArray(body.preExistingConditions) && body.preExistingConditions.length === 0) delete body.preExistingConditions;
    if (body.allergies && Array.isArray(body.allergies) && body.allergies.length === 0) delete body.allergies;
    if (body.familyHistory && Object.keys(body.familyHistory).length === 0) delete body.familyHistory;
    if (body.identifiers && Object.keys(body.identifiers).length === 0) delete body.identifiers;
    if (body.emergencyContact) {
      const ec = body.emergencyContact;
      if ((!ec.name || ec.name === '') && (!ec.phone || ec.phone === '') && (!ec.relationship || ec.relationship === '')) {
        delete body.emergencyContact;
      }
    }

    // Determine tenant membership for the new patient (explicit nested
    // junction create — see lib/data/patient.ts createPatient()).
    let tenantIds: string[] = Array.isArray(body.tenantIds) ? body.tenantIds : [];
    if (tenantId && tenantIds.length === 0) {
      tenantIds = [tenantId];
    } else if (body.tenantId && tenantIds.length === 0) {
      tenantIds = [body.tenantId];
    }
    delete body.tenantIds;
    delete body.tenantId;

    // Auto-generate patientCode if not provided (globally unique — see
    // prisma/schema.prisma note on Patient.patientCode).
    if (!body.patientCode) {
      let patientCode = '';
      let attempts = 0;
      const maxAttempts = 10;
      do {
        attempts++;
        if (attempts > maxAttempts) {
          return NextResponse.json(
            { success: false, error: 'Unable to generate unique patient code. Please try again.' },
            { status: 500 }
          );
        }
        const nextNumber = (await runAsSystem(() => getMaxPatientCodeNumber())) + attempts;
        patientCode = `CLINIC-${String(nextNumber).padStart(4, '0')}`;
        const exists = await runAsSystem(() => patientCodeExists(patientCode));
        if (!exists) break;
      } while (true);
      body.patientCode = patientCode;
    }

    let patient;
    let createAttempts = 0;
    const maxCreateAttempts = 5;
    while (createAttempts < maxCreateAttempts) {
      try {
        patient = await runAsSystem(() => createPatient(body, { tenantIds }));
        break;
      } catch (createError: any) {
        createAttempts++;
        if (createError.code === 'P2002' && createError.meta?.target?.includes?.('patientCode')) {
          if (createAttempts >= maxCreateAttempts) {
            return NextResponse.json(
              { success: false, error: 'Unable to create patient due to code conflict. Please try again.' },
              { status: 500 }
            );
          }
          const nextNumber = (await runAsSystem(() => getMaxPatientCodeNumber())) + createAttempts + 1;
          body.patientCode = `CLINIC-${String(nextNumber).padStart(4, '0')}`;
          continue;
        }
        throw createError;
      }
    }

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Failed to create patient. Please try again.' },
        { status: 500 }
      );
    }

    if (body.email) {
      import('@/lib/automations/welcome-messages').then(({ sendWelcomeMessage }) => {
        sendWelcomeMessage({
          patientId: patient!.id,
          tenantIds,
          sendSMS: true,
          sendEmail: true,
          sendNotification: false,
        }).catch((error) => {
          console.error('Error sending welcome message:', error);
        });
      }).catch((error) => {
        console.error('Error loading welcome messages module:', error);
      });
    }

    return NextResponse.json({ success: true, data: patient }, { status: 201 });
  } catch (error: any) {
    logger.error('Error creating patient', error as Error, {
      name: error.name,
      code: error.code,
    });

    if (error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'Patient with this email already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create patient' },
      { status: 500 }
    );
  }
}
