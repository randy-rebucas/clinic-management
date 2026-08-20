import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { listLabResults, buildLabResultWhere, flattenLabResultInput, getMaxLabResultCodeNumber } from '@/lib/data/lab-result';
import { getPatientById } from '@/lib/data/patient';
import prisma from '@/lib/prisma';
import { labResultInclude, toLabResultDTO } from '@/lib/data/lab-result';
import type { Prisma } from '@prisma/client';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'lab-results', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const visitId = searchParams.get('visitId');
    const status = searchParams.get('status');

    const where = buildLabResultWhere({
      patientId: patientId || undefined,
      visitId: visitId || undefined,
      status: status || undefined,
    });

    const labResults = await run(tenantId, () => listLabResults(where));

    return NextResponse.json({ success: true, data: labResults });
  } catch (error: any) {
    console.error('Error fetching lab results:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch lab results' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'lab-results', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const body = await request.json();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    if (!body.orderedBy) {
      body.orderedBy = session.userId;
    }
    if (!body.orderDate) {
      body.orderDate = new Date();
    }

    const labResult = await run(tenantId, async () => {
      // Validate that the patient belongs to the tenant (junction-scoped)
      if (body.patient && tenantId) {
        const patient = await runAsSystem(() => getPatientById(body.patient));
        const belongsToTenant = patient?.tenantIds?.some((tid: string) => tid === tenantId);
        if (!belongsToTenant) {
          throw new ValidationError('Invalid patient selected. Please select a patient from this clinic.');
        }
      }

      const nextNumber = (await getMaxLabResultCodeNumber()) + 1;
      const flat = flattenLabResultInput(body);

      const created = await prisma.labResult.create({
        data: {
          ...flat,
          requestCode: `LAB-${String(nextNumber).padStart(6, '0')}`,
          patient: { connect: { id: body.patient } },
          visit: body.visit ? { connect: { id: body.visit } } : undefined,
          orderedBy: body.orderedBy ? { connect: { id: body.orderedBy } } : undefined,
        } as Prisma.LabResultCreateInput,
        include: labResultInclude,
      });
      return toLabResultDTO(created);
    });

    return NextResponse.json({ success: true, data: labResult }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating lab result:', error);
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Failed to create lab result' }, { status: 500 });
  }
}

class ValidationError extends Error {}
