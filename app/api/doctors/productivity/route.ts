import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admin and accountants can view all doctor productivity
  if (session.role !== 'admin' && session.role !== 'accountant') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const doctors = await Doctor.find({ status: 'active' })
      .populate('specializationId', 'name');

    // Import models for productivity calculation
    const Appointment = (await import('@/models/Appointment')).default;
    const Visit = (await import('@/models/Visit')).default;
    const Prescription = (await import('@/models/Prescription')).default;
    const Invoice = (await import('@/models/Invoice')).default;
    
    const productivityReports = await Promise.all(
      doctors.map(async (doctor) => {
        try {

          const dateQuery: any = {};
          if (startDate || endDate) {
            dateQuery.date = {};
            if (startDate) dateQuery.date.$gte = new Date(startDate);
            if (endDate) {
              const end = new Date(endDate);
              end.setHours(23, 59, 59, 999);
              dateQuery.date.$lte = end;
            }
          }

          const appointmentQuery: any = { doctor: doctor._id };
          if (startDate || endDate) {
            appointmentQuery.appointmentDate = {};
            if (startDate) appointmentQuery.appointmentDate.$gte = new Date(startDate);
            if (endDate) {
              const end = new Date(endDate);
              end.setHours(23, 59, 59, 999);
              appointmentQuery.appointmentDate.$lte = end;
            }
          }

          const [appointments, visits, prescriptions] = await Promise.all([
            Appointment.find(appointmentQuery),
            Visit.find({ provider: doctor._id, ...dateQuery }),
            Prescription.find({ prescribedBy: doctor._id, ...dateQuery }),
          ]);

          const totalAppointments = appointments.length;
          const completedAppointments = appointments.filter(a => a.status === 'completed').length;
          const totalRevenue = visits.length > 0
            ? (await Invoice.find({
                visit: { $in: visits.map(v => v._id) },
                ...(startDate || endDate ? {
                  createdAt: {
                    ...(startDate ? { $gte: new Date(startDate) } : {}),
                    ...(endDate ? { $lte: new Date(endDate + 'T23:59:59.999Z') } : {}),
                  },
                } : {}),
              })).reduce((sum: number, inv: any) => sum + (inv.totalPaid || 0), 0)
            : 0;

          return {
            doctor: {
              _id: doctor._id,
              name: `${doctor.firstName} ${doctor.lastName}`,
              specialization: doctor.specialization,
            },
            summary: {
              totalAppointments,
              completedAppointments,
              totalVisits: visits.length,
              totalPrescriptions: prescriptions.length,
              totalRevenue,
            },
            metrics: {
              completionRate: totalAppointments > 0
                ? ((completedAppointments / totalAppointments) * 100).toFixed(2)
                : 0,
            },
          };
        } catch (error) {
          console.error(`Error calculating productivity for doctor ${doctor._id}:`, error);
          return {
            doctor: {
              _id: doctor._id,
              name: `${doctor.firstName} ${doctor.lastName}`,
              specialization: (doctor.specializationId as any)?.name || 'Unknown',
            },
            error: 'Failed to calculate productivity',
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        period: startDate && endDate ? { startDate, endDate } : { allTime: true },
        reports: productivityReports,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error generating productivity reports:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate productivity reports' },
      { status: 500 }
    );
  }
}

