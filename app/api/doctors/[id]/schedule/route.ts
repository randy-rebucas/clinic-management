import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
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
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const doctor = await Doctor.findById(id).select('schedule availabilityOverrides status');

    if (!doctor) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }

    // Get schedule for specific date range if provided
    const scheduleData = {
      weeklySchedule: doctor.schedule || [],
      availabilityOverrides: doctor.availabilityOverrides || [],
    };

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Filter overrides for the date range
      scheduleData.availabilityOverrides = (doctor.availabilityOverrides || []).filter(
        (override: any) => {
          const overrideDate = new Date(override.date);
          return overrideDate >= start && overrideDate <= end;
        }
      );
    }

    return NextResponse.json({ success: true, data: scheduleData });
  } catch (error: any) {
    console.error('Error fetching doctor schedule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch doctor schedule' },
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

  // Only admin or the doctor themselves can update schedule
  if (session.role !== 'admin' && session.role !== 'doctor') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();

    const doctor = await Doctor.findByIdAndUpdate(
      id,
      {
        schedule: body.schedule,
        availabilityOverrides: body.availabilityOverrides,
      },
      { new: true, runValidators: true }
    ).select('schedule availabilityOverrides status');

    if (!doctor) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: doctor });
  } catch (error: any) {
    console.error('Error updating doctor schedule:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update doctor schedule' },
      { status: 500 }
    );
  }
}

