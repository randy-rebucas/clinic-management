import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function GET(
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
    
    // Validate ObjectId format
    const mongoose = await import('mongoose');
    if (!mongoose.default.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid prescription ID format' },
        { status: 400 }
      );
    }

    const prescription = await Prescription.findById(id)
      .populate('patient', 'firstName lastName patientCode email phone dateOfBirth')
      .populate('prescribedBy', 'name email')
      .populate('visit', 'visitCode date');

    if (!prescription) {
      return NextResponse.json(
        { success: false, error: 'Prescription not found' },
        { status: 404 }
      );
    }

    // Convert to plain object for JSON serialization
    let prescriptionData: any;
    if (prescription && typeof prescription.toObject === 'function') {
      prescriptionData = prescription.toObject();
    } else {
      prescriptionData = prescription;
    }
    
    // Optionally populate medicineId references if they exist (non-blocking)
    if (prescriptionData.medications && Array.isArray(prescriptionData.medications)) {
      const Medicine = mongoose.default.models.Medicine;
      if (Medicine) {
        // Use Promise.all for parallel fetching, but don't fail if any fail
        const medicinePromises = prescriptionData.medications
          .filter((med: any) => med.medicineId && mongoose.default.Types.ObjectId.isValid(med.medicineId))
          .map(async (medication: any) => {
            try {
              const medicine = await Medicine.findById(medication.medicineId)
                .select('name genericName form strength')
                .lean();
              if (medicine) {
                medication.medicine = medicine;
              }
            } catch (err) {
              // Silently skip if medicine not found - not critical
            }
          });
        
        // Wait for all medicine lookups, but don't fail if some fail
        await Promise.allSettled(medicinePromises);
      }
    }

    return NextResponse.json({ success: true, data: prescriptionData });
  } catch (error: any) {
    console.error('Error fetching prescription:', error);
    const errorMessage = error.message || error.toString() || 'Failed to fetch prescription';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function PUT(
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

    // Sanitize ObjectId fields - convert empty strings to undefined
    if (body.visit === '' || body.visit === null) {
      body.visit = undefined;
    }
    if (body.prescribedBy === '' || body.prescribedBy === null) {
      body.prescribedBy = undefined;
    }
    if (body.patient === '' || body.patient === null) {
      body.patient = undefined;
    }

    const prescription = await Prescription.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    })
      .populate('patient', 'firstName lastName patientCode')
      .populate('prescribedBy', 'name email')
      .populate('visit', 'visitCode date');

    if (!prescription) {
      return NextResponse.json(
        { success: false, error: 'Prescription not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: prescription });
  } catch (error: any) {
    console.error('Error updating prescription:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update prescription' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    const prescription = await Prescription.findByIdAndDelete(id);

    if (!prescription) {
      return NextResponse.json(
        { success: false, error: 'Prescription not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) {
    console.error('Error deleting prescription:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete prescription' },
      { status: 500 }
    );
  }
}

