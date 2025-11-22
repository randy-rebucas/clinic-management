import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';

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
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const providerId = searchParams.get('providerId');
    const status = searchParams.get('status');
    const date = searchParams.get('date');

    let query: any = {};
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

    const visits = await Visit.find(query)
      .populate('patient', 'firstName lastName patientCode')
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
    
    // Auto-generate visitCode if not provided
    if (!body.visitCode) {
      const lastVisit = await Visit.findOne({ visitCode: { $exists: true, $ne: null } })
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
    
    const visit = await Visit.create(body);
    await visit.populate('patient', 'firstName lastName patientCode');
    await visit.populate('provider', 'name email');
    
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

