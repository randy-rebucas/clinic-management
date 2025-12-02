import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';

/**
 * Public endpoint for patient self-registration
 * No authentication required - allows patients to register themselves
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    
    console.log('Public patient registration with data:', JSON.stringify(body, null, 2));
    
    // Validate required fields
    if (!body.firstName || !body.lastName || !body.phone || !body.dateOfBirth) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: firstName, lastName, phone, and dateOfBirth are required' },
        { status: 400 }
      );
    }

    // Handle email - if provided, check for duplicates and normalize
    if (body.email && body.email.trim()) {
      const normalizedEmail = body.email.toLowerCase().trim();
      const existingPatient = await Patient.findOne({ email: normalizedEmail });
      if (existingPatient) {
        return NextResponse.json(
          { success: false, error: 'A patient with this email already exists. Please use a different email or contact the clinic.' },
          { status: 409 }
        );
      }
      body.email = normalizedEmail;
    } else {
      // Generate a unique email placeholder if not provided
      // Use patient code pattern to ensure uniqueness
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      body.email = `patient-${timestamp}-${randomSuffix}@clinic.local`;
    }
    
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
    
    // Set default status for public registrations
    body.active = body.active !== undefined ? body.active : true;
    
    // Create patient
    const patient = await Patient.create(body);
    
    logger.info('Public patient registration successful', {
      patientId: patient._id.toString(),
      patientCode: patient.patientCode,
      email: patient.email,
    });
    
    return NextResponse.json({ 
      success: true, 
      data: patient,
      message: 'Patient registration successful. Your patient code is: ' + patient.patientCode
    }, { status: 201 });
  } catch (error: any) {
    logger.error('Error in public patient registration', error as Error, {
      name: error.name,
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
        { success: false, error: 'A patient with this email or patient code already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to register patient. Please try again or contact the clinic.' },
      { status: 500 }
    );
  }
}

