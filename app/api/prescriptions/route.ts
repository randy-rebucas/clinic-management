import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const visitId = searchParams.get('visitId');
    const status = searchParams.get('status');

    let query: any = {};
    if (patientId) {
      query.patient = patientId;
    }
    if (visitId) {
      query.visit = visitId;
    }
    if (status) {
      query.status = status;
    }

    const prescriptions = await Prescription.find(query)
      .populate('patient', 'firstName lastName patientCode')
      .populate('prescribedBy', 'name email')
      .populate('visit', 'visitCode date')
      .sort({ issuedAt: -1 });

    return NextResponse.json({ success: true, data: prescriptions });
  } catch (error: any) {
    console.error('Error fetching prescriptions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch prescriptions' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const body = await request.json();

    // Auto-generate prescription code
    const lastPrescription = await Prescription.findOne({ prescriptionCode: { $exists: true, $ne: null } })
      .sort({ prescriptionCode: -1 })
      .exec();

    let nextNumber = 1;
    if (lastPrescription?.prescriptionCode) {
      const match = lastPrescription.prescriptionCode.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    body.prescriptionCode = `RX-${String(nextNumber).padStart(6, '0')}`;

    // Set prescribedBy to current user if not specified
    if (!body.prescribedBy) {
      body.prescribedBy = session.userId;
    }

    // Handle digital signature
    if (body.digitalSignature) {
      const clientIp = request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip') ||
        'unknown';
      body.digitalSignature = {
        ...body.digitalSignature,
        signedAt: new Date(),
      };
    }

    const prescription = await Prescription.create(body);
    await prescription.populate('patient', 'firstName lastName patientCode');
    await prescription.populate('prescribedBy', 'name email');

    return NextResponse.json({ success: true, data: prescription }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating prescription:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create prescription' },
      { status: 500 }
    );
  }
}

