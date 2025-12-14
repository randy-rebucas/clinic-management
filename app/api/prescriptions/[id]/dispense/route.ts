import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    
    // Get tenant context from session or headers
    const { getTenantContext } = await import('@/lib/tenant');
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    const { Types } = await import('mongoose');
    
    const { id } = await params;
    const body = await request.json();

    // Build query with tenant filter
    const query: any = { _id: id };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }

    const prescription = await Prescription.findOne(query);
    if (!prescription) {
      return NextResponse.json(
        { success: false, error: 'Prescription not found' },
        { status: 404 }
      );
    }

    // Add dispense record
    const dispenseRecord = {
      pharmacyId: body.pharmacyId,
      pharmacyName: body.pharmacyName,
      dispensedAt: new Date(),
      dispensedBy: body.dispensedBy || 'Pharmacy Staff',
      quantityDispensed: body.quantityDispensed,
      notes: body.notes,
      trackingNumber: body.trackingNumber,
    };

    if (!prescription.pharmacyDispenses) {
      prescription.pharmacyDispenses = [];
    }
    prescription.pharmacyDispenses.push(dispenseRecord);

    // Update status
    const totalDispensed = prescription.pharmacyDispenses.reduce(
      (sum: number, d: any) => sum + (d.quantityDispensed || 0),
      0
    );
    const totalPrescribed = prescription.medications.reduce(
      (sum: number, m: any) => sum + (m.quantity || 0),
      0
    );

    if (totalDispensed >= totalPrescribed) {
      prescription.status = 'dispensed';
    } else if (totalDispensed > 0) {
      prescription.status = 'partially-dispensed';
    }

    await prescription.save();
    
    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    const prescribedByPopulateOptions: any = {
      path: 'prescribedBy',
      select: 'name email',
    };
    if (tenantId) {
      prescribedByPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      prescribedByPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    await prescription.populate(patientPopulateOptions);
    await prescription.populate(prescribedByPopulateOptions);

    return NextResponse.json({ success: true, data: prescription });
  } catch (error: any) {
    console.error('Error recording dispense:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to record dispense' },
      { status: 500 }
    );
  }
}

