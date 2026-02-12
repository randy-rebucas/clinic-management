import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to read prescriptions
  const permissionCheck = await requirePermission(session, 'prescriptions', 'read');
  if (permissionCheck) {
    return permissionCheck;
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

    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Build query with tenant filter
    const query: any = { _id: id };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }

    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode email phone dateOfBirth',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantIds: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantIds: { $exists: false } }, { tenantIds: { $size: 0 } }] };
    }

    const prescription = await Prescription.findOne(query)
      .populate(patientPopulateOptions)
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

  // Check permission to update prescriptions
  const permissionCheck = await requirePermission(session, 'prescriptions', 'update');
  if (permissionCheck) {
    return permissionCheck;
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

    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Build query with tenant filter
    const query: any = { _id: id };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }

    const prescription = await Prescription.findOneAndUpdate(query, body, {
      new: true,
      runValidators: true,
    });
    
    if (!prescription) {
      return NextResponse.json(
        { success: false, error: 'Prescription not found' },
        { status: 404 }
      );
    }
    
    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantIds: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantIds: { $exists: false } }, { tenantIds: { $size: 0 } }] };
    }
    
    await prescription.populate(patientPopulateOptions);
    await prescription.populate('prescribedBy', 'name email');
    await prescription.populate('visit', 'visitCode date');

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

  // Check permission to delete prescriptions
  const permissionCheck = await requirePermission(session, 'prescriptions', 'delete');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Build query with tenant filter
    const query: any = { _id: id };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    const prescription = await Prescription.findOneAndDelete(query);

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

