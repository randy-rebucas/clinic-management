import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';
import logger from '@/lib/logger';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

export async function GET(request: NextRequest) {
  // User authentication check
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to read patients
  const permissionCheck = await requirePermission(session, 'patients', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const sex = searchParams.get('sex') || '';
    const active = searchParams.get('active');
    const minAge = searchParams.get('minAge');
    const maxAge = searchParams.get('maxAge');
    const city = searchParams.get('city') || '';
    const state = searchParams.get('state') || '';
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const limit = searchParams.get('limit');
    const page = searchParams.get('page') || '1';

    // Build filter query
    const filter: any = {};
    
    // Add tenant filter (multi-tenant support)
    const tenantFilter: any = {};
    if (tenantId) {
      // Match if tenantIds contains the tenantId (array)
      tenantFilter.tenantIds = new Types.ObjectId(tenantId);
    } else {
      // Backward compatibility: match docs with no tenantIds or null
      tenantFilter.$or = [
        { tenantIds: { $exists: false } },
        { tenantIds: null },
        { tenantIds: { $size: 0 } }
      ];
    }

    // Search filter - search across multiple fields
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const searchConditions = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { middleName: searchRegex },
        { email: searchRegex },
        { phone: { $regex: search.replace(/\D/g, ''), $options: 'i' } },
        { patientCode: searchRegex },
        { 'address.city': searchRegex },
        { 'address.state': searchRegex },
      ];
      
      // Combine tenant filter with search conditions
      filter.$and = [
        tenantFilter,
        { $or: searchConditions }
      ];
    } else {
      // No search, just use tenant filter
      Object.assign(filter, tenantFilter);
    }

    // Sex filter
    if (sex && sex !== 'all') {
      filter.sex = sex;
    }

    // Active status filter
    if (active !== null && active !== undefined) {
      filter.active = active === 'true';
    }

    // Age range filter
    if (minAge || maxAge) {
      const now = new Date();
      if (maxAge) {
        const minDate = new Date(now.getFullYear() - parseInt(maxAge) - 1, now.getMonth(), now.getDate());
        filter.dateOfBirth = { ...filter.dateOfBirth, $gte: minDate };
      }
      if (minAge) {
        const maxDate = new Date(now.getFullYear() - parseInt(minAge), now.getMonth(), now.getDate());
        filter.dateOfBirth = { ...filter.dateOfBirth, $lte: maxDate };
      }
    }

    // Location filters
    if (city) {
      filter['address.city'] = new RegExp(city, 'i');
    }
    if (state) {
      filter['address.state'] = new RegExp(state, 'i');
    }

    // Build sort object
    const sort: any = {};
    if (sortBy === 'name') {
      sort.lastName = sortOrder === 'asc' ? 1 : -1;
      sort.firstName = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'dateOfBirth') {
      sort.dateOfBirth = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'patientCode') {
      sort.patientCode = sortOrder === 'asc' ? 1 : -1;
    } else {
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    }

    // Pagination - use settings default if limit not provided
    const settings = await getSettings();
    const defaultLimit = settings.generalSettings?.itemsPerPage || 20;
    const pageNum = parseInt(page);
    const limitNum = limit ? parseInt(limit) : defaultLimit;
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query = Patient.find(filter).sort(sort).skip(skip).limit(limitNum);

    // Execute query
    const [patients, total] = await Promise.all([
      query.exec(),
      Patient.countDocuments(filter),
    ]);

    return NextResponse.json({
      success: true,
      data: patients,
      pagination: limitNum ? {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      } : undefined,
    });
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

  // Check permission to write/create patients
  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Check subscription limit for creating patients
    if (tenantId) {
      const { checkSubscriptionLimit } = await import('@/lib/subscription-limits');
      const limitCheck = await checkSubscriptionLimit(tenantId, 'createPatient');
      if (!limitCheck.allowed) {
        return NextResponse.json(
          { 
            success: false, 
            error: limitCheck.reason || 'Subscription limit exceeded',
            limit: limitCheck.limit,
            current: limitCheck.current,
            remaining: limitCheck.remaining,
          },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    
    // Ensure patient is created with tenantIds array
    if (tenantId && !body.tenantIds) {
      body.tenantIds = [new Types.ObjectId(tenantId)];
    } else if (body.tenantId && !body.tenantIds) {
      // Migrate single tenantId to tenantIds array if present in body
      body.tenantIds = [new Types.ObjectId(body.tenantId)];
      delete body.tenantId;
    }
    
    console.log('Creating patient with data:', JSON.stringify(body, null, 2));
    
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
            { success: false, error: 'Unable to generate unique patient code. Please try again.' },
            { status: 500 }
          );
        }
        
        // Find the highest patient code number (tenant-scoped)
        const codeQuery: any = {
          patientCode: { $exists: true, $ne: null, $regex: /^CLINIC-\d+$/ }
        };
        if (tenantId) {
          codeQuery.tenantIds = new Types.ObjectId(tenantId);
        } else {
          codeQuery.$or = [
            { tenantIds: { $exists: false } },
            { tenantIds: null },
            { tenantIds: { $size: 0 } }
          ];
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
        const existingQuery: any = { patientCode };
        if (tenantId) {
          existingQuery.tenantIds = new Types.ObjectId(tenantId);
        } else {
          existingQuery.$or = [
            { tenantIds: { $exists: false } },
            { tenantIds: null },
            { tenantIds: { $size: 0 } }
          ];
        }
        const existing = await Patient.findOne(existingQuery);
        if (!existing) {
          break; // Code is available
        }
        
        // If code exists, try next number
        nextNumber++;
        patientCode = `CLINIC-${String(nextNumber).padStart(4, '0')}`;
      } while (true);
      
      body.patientCode = patientCode;
    }
    
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
            codeQuery.tenantIds = new Types.ObjectId(tenantId);
          } else {
            codeQuery.$or = [
              { tenantIds: { $exists: false } },
              { tenantIds: null },
              { tenantIds: { $size: 0 } }
            ];
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

    // Send welcome message (async, don't wait)
    import('@/lib/automations/welcome-messages').then(({ sendWelcomeMessage }) => {
      sendWelcomeMessage({
        patientId: patient._id,
        tenantIds: Array.isArray(patient.tenantIds) ? patient.tenantIds.map((id: any) => id.toString()) : [],
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

    return NextResponse.json({ success: true, data: patient }, { status: 201 });
  } catch (error: any) {
    logger.error('Error creating patient', error as Error, {
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

