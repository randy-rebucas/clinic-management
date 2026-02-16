import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();
  const permissionCheck = await requirePermission(session, 'doctors', 'read');
  if (permissionCheck) return permissionCheck;
  try {
    await connectDB();
    const { id } = await params;
    const doctor = await Doctor.findById(id);
    if (!doctor) {
      return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: doctor.professionalFees || [] });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to fetch fees' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();
  const permissionCheck = await requirePermission(session, 'doctors', 'update');
  if (permissionCheck) return permissionCheck;
  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();
    const doctor = await Doctor.findById(id);
    if (!doctor) {
      return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 });
    }
    doctor.professionalFees = doctor.professionalFees || [];
    const fee = {
      invoiceId: body.invoiceId,
      visitId: body.visitId,
      amount: body.amount,
      type: body.type,
      notes: body.notes,
      date: body.date || new Date(),
    };
    doctor.professionalFees.push(fee);
    await doctor.save();

    // Audit log
    const { logAudit } = await import('@/app/lib/audit-log');
    await logAudit({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      action: 'update',
      resource: 'doctor',
      resourceId: doctor._id,
      changes: [{ field: 'professionalFees', newValue: fee }],
      description: `Added professional fee for doctor ${doctor._id}`,
      success: true,
      requestMethod: request.method,
      requestPath: request.url,
      ipAddress: request.headers.get('x-forwarded-for') || '',
      userAgent: request.headers.get('user-agent') || '',
      metadata: { invoiceId: body.invoiceId, visitId: body.visitId },
    });

    return NextResponse.json({ success: true, data: doctor.professionalFees });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to add fee' }, { status: 500 });
  }
}
