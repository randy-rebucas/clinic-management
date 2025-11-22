import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params;
    const visit = await Visit.findById(id)
      .populate('patient', 'firstName lastName patientCode email phone')
      .populate('provider', 'name email')
      .populate('prescriptions')
      .populate('labsOrdered')
      .populate('imagingOrdered')
      .populate('proceduresPerformed');
    
    if (!visit) {
      return NextResponse.json(
        { success: false, error: 'Visit not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: visit });
  } catch (error) {
    console.error('Error fetching visit:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch visit' },
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

  // Check permission to update visits
  const permissionCheck = await requirePermission(session, 'visits', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();
    
    // Auto-generate visitCode if creating new visit
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
    
    const visit = await Visit.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    })
      .populate('patient', 'firstName lastName patientCode email phone')
      .populate('provider', 'name email');
    
    if (!visit) {
      return NextResponse.json(
        { success: false, error: 'Visit not found' },
        { status: 404 }
      );
    }
    
    // Send follow-up reminder if followUpDate is set and not sent yet
    if (visit.followUpDate && !visit.followUpReminderSent) {
      // Schedule reminder (async, don't wait)
      sendFollowUpReminder(visit).catch(console.error);
    }
    
    return NextResponse.json({ success: true, data: visit });
  } catch (error: any) {
    console.error('Error updating visit:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update visit' },
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

  // Check permission to delete visits
  const permissionCheck = await requirePermission(session, 'visits', 'delete');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    const visit = await Visit.findByIdAndDelete(id);
    if (!visit) {
      return NextResponse.json(
        { success: false, error: 'Visit not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    console.error('Error deleting visit:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete visit' },
      { status: 500 }
    );
  }
}

// Follow-up reminder function (placeholder - implement with your email service)
async function sendFollowUpReminder(visit: any) {
  const patient = visit.patient;
  const followUpDate = visit.followUpDate;
  
  console.log('Sending follow-up reminder:', {
    to: patient.email,
    patient: `${patient.firstName} ${patient.lastName}`,
    followUpDate: followUpDate.toLocaleDateString(),
  });
  
  // TODO: Implement actual email sending
  // Update reminderSent flag after sending
}

