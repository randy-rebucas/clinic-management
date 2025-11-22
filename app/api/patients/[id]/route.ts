import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params;
    const patient = await Patient.findById(id);
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: patient });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch patient' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // User authentication check
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to update patients
  const permissionCheck = await requirePermission(session, 'patients', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();
    const patient = await Patient.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    });
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: patient });
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update patient' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // User authentication check
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to delete patients
  const permissionCheck = await requirePermission(session, 'patients', 'delete');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    const patient = await Patient.findByIdAndDelete(id);
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to delete patient' },
      { status: 500 }
    );
  }
}

