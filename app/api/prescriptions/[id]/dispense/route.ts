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
    const { id } = await params;
    const body = await request.json();

    const prescription = await Prescription.findById(id);
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
      (sum, d) => sum + (d.quantityDispensed || 0),
      0
    );
    const totalPrescribed = prescription.medications.reduce(
      (sum, m) => sum + (m.quantity || 0),
      0
    );

    if (totalDispensed >= totalPrescribed) {
      prescription.status = 'dispensed';
    } else if (totalDispensed > 0) {
      prescription.status = 'partially-dispensed';
    }

    await prescription.save();
    await prescription.populate('patient', 'firstName lastName patientCode');
    await prescription.populate('prescribedBy', 'name email');

    return NextResponse.json({ success: true, data: prescription });
  } catch (error: any) {
    console.error('Error recording dispense:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to record dispense' },
      { status: 500 }
    );
  }
}

