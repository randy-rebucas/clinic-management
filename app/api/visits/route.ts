import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

export async function GET(request: NextRequest) {
  // User authentication check
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to read visits
  const permissionCheck = await requirePermission(session, 'visits', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const providerId = searchParams.get('providerId');
    const status = searchParams.get('status');
    const date = searchParams.get('date');

    const query: any = {};
    
    // Add tenant filter
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    if (patientId) {
      query.patient = patientId;
    }
    if (providerId) {
      query.provider = providerId;
    }
    if (status) {
      query.status = status;
    }
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.date = { $gte: startOfDay, $lte: endOfDay };
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

    const visits = await Visit.find(query)
      .populate(patientPopulateOptions)
      .populate('provider', 'name email')
      .sort({ date: -1 });

    return NextResponse.json({ success: true, data: visits });
  } catch (error: any) {
    console.error('Error fetching visits:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch visits' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to write/create visits
  const permissionCheck = await requirePermission(session, 'visits', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const body = await request.json();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Check subscription limit for creating visits
    if (tenantId) {
      const { checkSubscriptionLimit } = await import('@/lib/subscription-limits');
      const limitCheck = await checkSubscriptionLimit(tenantId, 'createVisit');
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
    
    // Validate that the patient belongs to the tenant
    // Patient model uses tenantIds (array) since patients can belong to multiple clinics
    if (body.patient && tenantId) {
      const patientQuery: any = {
        _id: body.patient,
        tenantIds: new Types.ObjectId(tenantId),
      };
      const patient = await Patient.findOne(patientQuery);
      if (!patient) {
        return NextResponse.json(
          { success: false, error: 'Invalid patient selected. Please select a patient from this clinic.' },
          { status: 400 }
        );
      }
    }
    
    // Auto-generate visitCode if not provided (tenant-scoped)
    if (!body.visitCode) {
      const codeQuery: any = { visitCode: { $exists: true, $ne: null } };
      if (tenantId) {
        codeQuery.tenantId = new Types.ObjectId(tenantId);
      } else {
        codeQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      const lastVisit = await Visit.findOne(codeQuery)
        .sort({ visitCode: -1 })
        .exec();
      
      let nextNumber = 1;
      if (lastVisit?.visitCode) {
        const match = lastVisit.visitCode.match(/(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }
      
      body.visitCode = `VISIT-${String(nextNumber).padStart(6, '0')}`;
    }
    
    // Set provider to current user if not specified
    if (!body.provider) {
      body.provider = session.userId;
    }
    
    // Handle digital signature - add provider ID and IP address
    if (body.digitalSignature) {
      const clientIp = request.headers.get('x-forwarded-for') || 
                       request.headers.get('x-real-ip') || 
                       'unknown';
      body.digitalSignature = {
        ...body.digitalSignature,
        providerId: session.userId,
        signedAt: new Date(),
        ipAddress: clientIp,
      };
    }
    
    // Ensure visit is created with tenantId
    const visitData: any = { ...body };
    if (tenantId && !visitData.tenantId) {
      visitData.tenantId = new Types.ObjectId(tenantId);
    }
    
    const visit = await Visit.create(visitData);
    
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
    
    await visit.populate(patientPopulateOptions);
    await visit.populate('provider', 'name email');
    
    // Auto-create prescription if medications are present in treatment plan
    if (body.treatmentPlan?.medications && body.treatmentPlan.medications.length > 0) {
      // Import and trigger prescription creation (async, don't wait)
      import('@/lib/automations/prescription-from-visit').then(({ createPrescriptionFromVisit }) => {
        createPrescriptionFromVisit({
          visitId: visit._id,
          tenantId: tenantId ? new Types.ObjectId(tenantId) : undefined,
          createdBy: session.userId,
          shouldSendNotification: true,
        }).catch((error) => {
          console.error('Error auto-creating prescription from visit:', error);
          // Don't fail the visit creation if prescription creation fails
        });
      }).catch((error) => {
        console.error('Error loading prescription automation module:', error);
      });
    }
    
    return NextResponse.json({ success: true, data: visit }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating visit:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create visit' },
      { status: 500 }
    );
  }
}

