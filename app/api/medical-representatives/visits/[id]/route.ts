import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { verifySession } from '@/app/lib/dal';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

interface VisitData {
  clinicName: string;
  clinicLocation: string;
  purpose: string;
  date: string;
  time: string;
  duration: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
}

/**
 * PUT /api/medical-representatives/visits/[id]
 * Update a visit
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (session.role !== 'medical-representative') {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    let body: VisitData;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { id: visitId } = await params;

    const updatedVisit = await run(session.tenantId, async () => {
      const existing = await prisma.medicalRepresentativeVisit.findFirst({ where: { id: visitId, userId: session.userId } });
      if (!existing) return null;
      return prisma.medicalRepresentativeVisit.update({
        where: { id: visitId },
        data: {
          clinicName: body.clinicName,
          clinicLocation: body.clinicLocation,
          purpose: body.purpose,
          date: new Date(body.date),
          time: body.time,
          duration: body.duration || 60,
          status: body.status || 'scheduled',
          notes: body.notes || '',
        },
      });
    });

    if (!updatedVisit) {
      return NextResponse.json(
        { success: false, error: 'Visit not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Visit updated successfully',
      data: updatedVisit,
    });
  } catch (error: any) {
    console.error('Update visit error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/medical-representatives/visits/[id]
 * Delete a visit
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (session.role !== 'medical-representative') {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const { id: visitId } = await params;

    const deletedVisit = await run(session.tenantId, async () => {
      const existing = await prisma.medicalRepresentativeVisit.findFirst({ where: { id: visitId, userId: session.userId } });
      if (!existing) return null;
      return prisma.medicalRepresentativeVisit.delete({ where: { id: visitId } });
    });

    if (!deletedVisit) {
      return NextResponse.json(
        { success: false, error: 'Visit not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Visit deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete visit error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
