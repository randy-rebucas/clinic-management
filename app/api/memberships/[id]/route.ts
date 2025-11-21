import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Membership from '@/models/Membership';
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
    const membership = await Membership.findById(id)
      .populate('patient', 'firstName lastName patientCode email phone')
      .populate('referredBy', 'firstName lastName patientCode')
      .populate('referrals', 'firstName lastName patientCode');

    if (!membership) {
      return NextResponse.json(
        { success: false, error: 'Membership not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: membership });
  } catch (error: any) {
    console.error('Error fetching membership:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch membership' },
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

    const membership = await Membership.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    })
      .populate('patient', 'firstName lastName patientCode')
      .populate('referredBy', 'firstName lastName patientCode');

    if (!membership) {
      return NextResponse.json(
        { success: false, error: 'Membership not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: membership });
  } catch (error: any) {
    console.error('Error updating membership:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update membership' },
      { status: 500 }
    );
  }
}

