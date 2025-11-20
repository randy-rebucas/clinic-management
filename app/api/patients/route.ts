import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function GET() {
  // User authentication check
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const patients = await Patient.find({}).sort({ createdAt: -1 });
    return NextResponse.json({ success: true, data: patients });
  } catch (error: any) {
    console.error('Error fetching patients:', error);
    const errorMessage = error?.message || 'Failed to fetch patients';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // User authentication check
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const body = await request.json();
    
    console.log('Creating patient with data:', JSON.stringify(body, null, 2));
    
    // Auto-generate patientCode if not provided
    if (!body.patientCode) {
      const lastPatient = await Patient.findOne({ patientCode: { $exists: true, $ne: null } })
        .sort({ patientCode: -1 })
        .exec();
      
      let nextNumber = 1;
      if (lastPatient?.patientCode) {
        const match = lastPatient.patientCode.match(/(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }
      
      body.patientCode = `CLINIC-${String(nextNumber).padStart(4, '0')}`;
    }
    
    const patient = await Patient.create(body);
    return NextResponse.json({ success: true, data: patient }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating patient:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      errors: error.errors,
    });
    
    if (error.name === 'ValidationError') {
      // Extract validation error messages
      const validationErrors = Object.values(error.errors || {}).map((err: any) => err.message).join(', ');
      return NextResponse.json(
        { success: false, error: validationErrors || error.message },
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
      { success: false, error: error.message || 'Failed to create patient' },
      { status: 500 }
    );
  }
}

