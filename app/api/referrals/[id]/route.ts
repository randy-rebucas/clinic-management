import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Referral from '@/models/Referral';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const { id } = await params;
    const referral = await Referral.findById(id)
      .populate('referringDoctor', 'firstName lastName specialization')
      .populate('receivingDoctor', 'firstName lastName specialization')
      .populate('patient', 'firstName lastName patientCode')
      .populate('visit', 'visitCode date')
      .populate('appointment', 'appointmentCode appointmentDate');

    if (!referral) {
      return NextResponse.json(
        { success: false, error: 'Referral not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: referral });
  } catch (error: any) {
    console.error('Error fetching referral:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch referral' },
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

  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();

    // Update status dates
    if (body.status === 'accepted' && !body.acceptedDate) {
      body.acceptedDate = new Date();
    }
    if (body.status === 'completed' && !body.completedDate) {
      body.completedDate = new Date();
    }
    if (body.status === 'declined' && !body.declinedDate) {
      body.declinedDate = new Date();
    }

    const referral = await Referral.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    })
      .populate('referringDoctor', 'firstName lastName specialization')
      .populate('receivingDoctor', 'firstName lastName specialization')
      .populate('patient', 'firstName lastName patientCode');

    if (!referral) {
      return NextResponse.json(
        { success: false, error: 'Referral not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: referral });
  } catch (error: any) {
    console.error('Error updating referral:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update referral' },
      { status: 500 }
    );
  }
}

