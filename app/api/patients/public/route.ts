import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';

/**
 * Public endpoint for patient self-registration
 * No authentication required - allows patients to register themselves
 * Rate limited to prevent abuse
 */
export async function POST(request: NextRequest) {
  // Apply rate limiting for public endpoint
  const rateLimitResponse = await applyRateLimit(request, rateLimiters.public);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  
  try {
    await connectDB();
    
    // Parse request body with error handling
    let body;
    try {
      body = await request.json();
    } catch (parseError: any) {
      logger.error('Failed to parse request body', parseError as Error);
      return NextResponse.json(
        { success: false, error: 'Invalid request format. Please check your input and try again.' },
        { status: 400 }
      );
    }
    
    // Validate body exists
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid request data. Please provide valid patient information.' },
        { status: 400 }
      );
    }
    
    console.log('Public patient registration with data:', JSON.stringify(body, null, 2));
    
    // Validate required fields
    if (!body.firstName || !body.lastName || !body.phone || !body.dateOfBirth) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: firstName, lastName, phone, and dateOfBirth are required' },
        { status: 400 }
      );
    }

    // Get tenantId from body if provided
    const tenantId = body.tenantId;

    // Handle email - if provided, check for duplicates and normalize (tenant-scoped)
    if (body.email && body.email.trim()) {
      const normalizedEmail = body.email.toLowerCase().trim();
      const emailQuery: any = { email: normalizedEmail };
      if (tenantId) {
        emailQuery.tenantId = tenantId;
      } else {
        // If no tenant, check for patients without tenantId (backward compatibility)
        emailQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      const existingPatient = await Patient.findOne(emailQuery);
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
    // Use retry mechanism to handle race conditions
    if (!body.patientCode) {
      let patientCode: string;
      let attempts = 0;
      const maxAttempts = 10;
      
      do {
        attempts++;
        if (attempts > maxAttempts) {
          return NextResponse.json(
            { success: false, error: 'Unable to generate unique patient code. Please try again or contact the clinic.' },
            { status: 500 }
          );
        }
        
        // Find the highest patient code number (tenant-scoped)
        const codeQuery: any = { 
          patientCode: { $exists: true, $ne: null, $regex: /^CLINIC-\d+$/ }
        };
        if (tenantId) {
          codeQuery.tenantId = tenantId;
        } else {
          codeQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
        }
        
        const lastPatient = await Patient.findOne(codeQuery)
          .sort({ patientCode: -1 })
          .exec();
        
        let nextNumber = 1;
        if (lastPatient?.patientCode) {
          const match = lastPatient.patientCode.match(/(\d+)$/);
          if (match) {
            nextNumber = parseInt(match[1], 10) + attempts; // Add attempts to avoid collisions
          }
        }
        
        patientCode = `CLINIC-${String(nextNumber).padStart(4, '0')}`;
        
        // Check if this code already exists (tenant-scoped)
        const codeExistsQuery: any = { patientCode };
        if (tenantId) {
          codeExistsQuery.tenantId = tenantId;
        } else {
          codeExistsQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
        }
        
        const existing = await Patient.findOne(codeExistsQuery);
        if (!existing) {
          break; // Code is available
        }
        
        // If code exists, try next number
        nextNumber++;
        patientCode = `CLINIC-${String(nextNumber).padStart(4, '0')}`;
      } while (true);
      
      body.patientCode = patientCode;
    }
    
    // Set default status for public registrations
    body.active = body.active !== undefined ? body.active : true;
    
    // Create patient with retry on duplicate key error
    let patient;
    let createAttempts = 0;
    const maxCreateAttempts = 5;
    
    while (createAttempts < maxCreateAttempts) {
      try {
        patient = await Patient.create(body);
        break; // Success
      } catch (createError: any) {
        createAttempts++;
        
        // If it's a duplicate key error for patientCode, generate a new one
        if (createError.code === 11000 && createError.keyPattern?.patientCode) {
          if (createAttempts >= maxCreateAttempts) {
            return NextResponse.json(
              { success: false, error: 'Unable to create patient due to code conflict. Please try again.' },
              { status: 500 }
            );
          }
          
          // Generate a new patient code (tenant-scoped)
          const codeQuery: any = { 
            patientCode: { $exists: true, $ne: null, $regex: /^CLINIC-\d+$/ }
          };
          if (tenantId) {
            codeQuery.tenantId = tenantId;
          } else {
            codeQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
          }
          
          const lastPatient = await Patient.findOne(codeQuery)
            .sort({ patientCode: -1 })
            .exec();
          
          let nextNumber = 1;
          if (lastPatient?.patientCode) {
            const match = lastPatient.patientCode.match(/(\d+)$/);
            if (match) {
              nextNumber = parseInt(match[1], 10) + createAttempts + 1;
            }
          }
          
          body.patientCode = `CLINIC-${String(nextNumber).padStart(4, '0')}`;
          continue; // Retry with new code
        }
        
        // If it's not a duplicate key error, throw it
        throw createError;
      }
    }
    
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Failed to create patient. Please try again.' },
        { status: 500 }
      );
    }
    
    logger.info('Public patient registration successful', {
      patientId: patient._id.toString(),
      patientCode: patient.patientCode,
      email: patient.email,
    });

    // Send welcome message (async, don't wait)
    import('@/lib/automations/welcome-messages').then(({ sendWelcomeMessage }) => {
      sendWelcomeMessage({
        patientId: patient._id,
        tenantId: patient.tenantId,
        sendSMS: true,
        sendEmail: true,
        sendNotification: false,
      }).catch((error) => {
        console.error('Error sending welcome message:', error);
        // Don't fail patient creation if welcome message fails
      });
    }).catch((error) => {
      console.error('Error loading welcome messages module:', error);
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
      message: error.message,
      stack: error.stack,
    });
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      // Extract validation error messages
      const validationErrors = Object.values(error.errors || {}).map((err: any) => err.message).join(', ');
      return NextResponse.json(
        { success: false, error: validationErrors || error.message || 'Validation error occurred' },
        { status: 400 }
      );
    }
    
    // Handle duplicate key errors (MongoDB)
    if (error.code === 11000) {
      const field = error.keyPattern ? Object.keys(error.keyPattern)[0] : 'field';
      return NextResponse.json(
        { success: false, error: `A patient with this ${field} already exists. Please use a different value or contact the clinic.` },
        { status: 409 }
      );
    }
    
    // Handle connection errors
    if (error.name === 'MongoServerError' || error.name === 'MongoNetworkError') {
      return NextResponse.json(
        { success: false, error: 'Database connection error. Please try again later or contact the clinic.' },
        { status: 503 }
      );
    }
    
    // Generic error handler - ensure we always return a proper error message
    const errorMessage = error.message || 'Failed to register patient. Please try again or contact the clinic.';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

