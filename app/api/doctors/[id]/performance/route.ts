import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import Appointment from '@/models/Appointment';
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
    
    // Get tenant context from session or headers
    const { getTenantContext } = await import('@/lib/tenant');
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    const { Types } = await import('mongoose');
    
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build query with tenant filter
    const doctorQuery: any = { _id: id };
    if (tenantId) {
      doctorQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      doctorQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }

    const doctor = await Doctor.findOne(doctorQuery)
      .populate('specializationId', 'name');
    if (!doctor) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }

    // Build date range query
    const dateQuery: any = {};
    if (startDate || endDate) {
      dateQuery.appointmentDate = {};
      if (startDate) {
        dateQuery.appointmentDate.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateQuery.appointmentDate.$lte = end;
      }
    }

    // Get appointment statistics (tenant-scoped)
    const appointmentQuery: any = {
      doctor: id,
      ...dateQuery,
    };
    if (tenantId) {
      appointmentQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      appointmentQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    const appointments = await Appointment.find(appointmentQuery);

    const totalAppointments = appointments.length;
    const completedAppointments = appointments.filter((apt) => apt.status === 'completed').length;
    const cancelledAppointments = appointments.filter((apt) => apt.status === 'cancelled').length;
    const noShowAppointments = appointments.filter((apt) => apt.status === 'no-show').length;

    // Calculate completion rate
    const completionRate = totalAppointments > 0 
      ? (completedAppointments / totalAppointments) * 100 
      : 0;

    // Calculate cancellation rate
    const cancellationRate = totalAppointments > 0 
      ? (cancelledAppointments / totalAppointments) * 100 
      : 0;

    // Calculate no-show rate
    const noShowRate = totalAppointments > 0 
      ? (noShowAppointments / totalAppointments) * 100 
      : 0;

    // Update doctor's performance metrics
    doctor.performanceMetrics = {
      totalAppointments,
      completedAppointments,
      cancelledAppointments,
      noShowAppointments,
      averageRating: doctor.performanceMetrics?.averageRating,
      lastUpdated: new Date(),
    };
    await doctor.save();

    return NextResponse.json({
      success: true,
      data: {
        doctor: {
          _id: doctor._id,
          name: `${doctor.firstName} ${doctor.lastName}`,
          specialization: (doctor.specializationId as any)?.name || 'Unknown',
        },
        metrics: {
          totalAppointments,
          completedAppointments,
          cancelledAppointments,
          noShowAppointments,
          completionRate: Math.round(completionRate * 100) / 100,
          cancellationRate: Math.round(cancellationRate * 100) / 100,
          noShowRate: Math.round(noShowRate * 100) / 100,
        },
        period: {
          startDate: startDate || null,
          endDate: endDate || null,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching performance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch performance data' },
      { status: 500 }
    );
  }
}

