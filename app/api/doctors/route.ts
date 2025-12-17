import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import Specialization from '@/models/Specialization';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

export async function GET() {
  // User authentication check
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to read doctors
  const permissionCheck = await requirePermission(session, 'doctors', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Build doctor query with tenant filter
    const doctorQuery: any = {};
    if (tenantId) {
      doctorQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      // If no tenant, get doctors without tenantId (backward compatibility)
      doctorQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    const doctors = await Doctor.find(doctorQuery)
      .populate('specializationId', 'name description category')
      .sort({ createdAt: -1 });
    return NextResponse.json({ success: true, data: doctors });
  } catch (error: any) {
    console.error('Error fetching doctors:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch doctors' },
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

  // Check permission to write/create doctors (typically admin only)
  const permissionCheck = await requirePermission(session, 'doctors', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const body = await request.json();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Check subscription limit for creating doctors
    if (tenantId) {
      const { checkSubscriptionLimit } = await import('@/lib/subscription-limits');
      const limitCheck = await checkSubscriptionLimit(tenantId, 'createDoctor');
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
    
    // Ensure doctor is created with tenantId
    if (tenantId && !body.tenantId) {
      body.tenantId = new Types.ObjectId(tenantId);
    }
    
    // Handle specialization: convert specialization string to specializationId
    if (body.specialization && !body.specializationId) {
      const specializationName = body.specialization.trim();
      
      if (!specializationName) {
        return NextResponse.json(
          { success: false, error: 'Specialization is required' },
          { status: 400 }
        );
      }
      
      // Find or create specialization for this tenant
      let specialization;
      const specializationQuery: any = { name: specializationName };
      if (tenantId) {
        specializationQuery.tenantId = new Types.ObjectId(tenantId);
      } else {
        specializationQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      specialization = await Specialization.findOne(specializationQuery);
      
      if (!specialization) {
        // Create new specialization if it doesn't exist
        const newSpecializationData: any = {
          name: specializationName,
          active: true,
        };
        if (tenantId) {
          newSpecializationData.tenantId = new Types.ObjectId(tenantId);
        }
        specialization = await Specialization.create(newSpecializationData);
      }
      
      // Replace specialization string with specializationId
      body.specializationId = specialization._id;
      delete body.specialization;
    }
    
    // Validate that specializationId exists
    if (!body.specializationId) {
      return NextResponse.json(
        { success: false, error: 'Specialization is required' },
        { status: 400 }
      );
    }
    
    const doctor = await Doctor.create(body);
    return NextResponse.json({ success: true, data: doctor }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Doctor with this email or license number already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create doctor' },
      { status: 500 }
    );
  }
}

