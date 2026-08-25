import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { verifySession } from '@/app/lib/dal';
import { isAdmin } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { sanitizeSearch } from '@/lib/utils';
import type { Prisma } from '@prisma/client';

// NOTE: MedicalRepresentative has no dedicated lib/data/*.ts module (same
// precedent as app/api/medical-representatives/login/route.ts from Phase 5
// Batch 1) — calls prisma.medicalRepresentative directly, wrapped in
// runWithTenant/runAsSystem. MedicalRepresentative is junction-scoped (see
// lib/prisma-tenant-extension.ts), so the tenant extension auto-scopes reads
// via the `tenants` relation when run inside runWithTenant.
function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

// GET /api/medical-representatives - Get all medical representatives
export async function GET(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const company = searchParams.get('company');
    const search = searchParams.get('search');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const skip = (page - 1) * limit;

    const where: Prisma.MedicalRepresentativeWhereInput = {};
    if (status) where.status = status as Prisma.MedicalRepresentativeWhereInput['status'];
    if (company) where.company = { contains: sanitizeSearch(company), mode: 'insensitive' };
    if (search) {
      const safeSearch = sanitizeSearch(search);
      where.OR = [
        { firstName: { contains: safeSearch, mode: 'insensitive' } },
        { lastName: { contains: safeSearch, mode: 'insensitive' } },
        { email: { contains: safeSearch, mode: 'insensitive' } },
        { company: { contains: safeSearch, mode: 'insensitive' } },
      ];
    }

    const [representatives, total] = await run(tenantId, () =>
      Promise.all([
        prisma.medicalRepresentative.findMany({
          where,
          include: { user: { select: { id: true, name: true, email: true, status: true } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.medicalRepresentative.count({ where }),
      ])
    );

    return NextResponse.json({
      success: true,
      data: representatives,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error fetching medical representatives:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch medical representatives' }, { status: 500 });
  }
}

// POST /api/medical-representatives - Create a new medical representative
export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can create medical representatives
    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const {
      firstName,
      lastName,
      email,
      phone,
      company,
      territory,
      products,
      notes,
    } = body;

    if (!firstName || !lastName || !email) {
      return NextResponse.json({ success: false, error: 'First name, last name, and email are required' }, { status: 400 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const representative = await run(tenantId, async () => {
      // Check if medical representative already exists with this email
      const existingRep = await prisma.medicalRepresentative.findFirst({
        where: { email: email.toLowerCase().trim() },
      });
      if (existingRep) {
        throw new DuplicateError('Medical representative with this email already exists');
      }

      // Generate rep code (tenant-scoped by the extension)
      const count = await prisma.medicalRepresentative.count();
      const repCode = `MR-${String(count + 1).padStart(4, '0')}`;

      // Convert company object to string (use name field)
      const companyString = typeof company === 'object' && company !== null
        ? (company.name || '')
        : (company || '');

      // Convert territory array to string (join with comma)
      const territoryString = Array.isArray(territory)
        ? territory.join(', ')
        : (territory || '');

      const createData: Prisma.MedicalRepresentativeCreateInput = {
        firstName,
        lastName,
        email: email.toLowerCase().trim(),
        phone,
        company: companyString,
        territory: territoryString,
        products: products || [],
        status: 'active',
      };
      // NOTE: the Mongoose schema had no top-level `notes` scalar field (only
      // `internalNotes` sub-documents), so assigning `repData.notes = notes`
      // was a silent no-op under strict mode. `notes` is intentionally not
      // persisted here to preserve that (unused) prior behavior.
      void notes;
      if (tenantId) {
        createData.tenants = { create: { tenantId } };
      }

      const created = await prisma.medicalRepresentative.create({
        data: createData,
        include: { user: { select: { id: true, name: true, email: true, status: true } } },
      });
      return created;
    });

    return NextResponse.json({
      success: true,
      data: representative,
      message: 'Medical representative created successfully',
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating medical representative:', error);
    if (error instanceof DuplicateError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error?.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'Medical representative with this email already exists' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: error.message || 'Failed to create medical representative' }, { status: 500 });
  }
}

class DuplicateError extends Error {}
