import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import Prescription from '@/models/Prescription';
import Invoice from '@/models/Invoice';
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

    const doctor = await Doctor.findById(id);
    if (!doctor) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }

    // Build date range query
    const dateQuery: any = {};
    if (startDate || endDate) {
      dateQuery.date = {};
      if (startDate) {
        dateQuery.date.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateQuery.date.$lte = end;
      }
    }

    // Get appointments
    const appointmentQuery: any = { doctor: id };
    if (startDate || endDate) {
      appointmentQuery.appointmentDate = {};
      if (startDate) {
        appointmentQuery.appointmentDate.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        appointmentQuery.appointmentDate.$lte = end;
      }
    }

    const appointments = await Appointment.find(appointmentQuery);
    const visits = await Visit.find({ provider: id, ...dateQuery });
    const prescriptions = await Prescription.find({ prescribedBy: id, ...dateQuery });

    // Calculate metrics
    const totalAppointments = appointments.length;
    const completedAppointments = appointments.filter(a => a.status === 'completed').length;
    const cancelledAppointments = appointments.filter(a => a.status === 'cancelled').length;
    const noShowAppointments = appointments.filter(a => a.status === 'no-show').length;
    const scheduledAppointments = appointments.filter(a => a.status === 'scheduled' || a.status === 'confirmed').length;

    const totalVisits = visits.length;
    const completedVisits = visits.filter(v => v.status === 'closed').length;
    const openVisits = visits.filter(v => v.status === 'open').length;

    const totalPrescriptions = prescriptions.length;
    const activePrescriptions = prescriptions.filter(p => p.status === 'active').length;
    const dispensedPrescriptions = prescriptions.filter(p => p.status === 'dispensed').length;

    // Calculate revenue from invoices (if doctor is associated)
    const invoices = await Invoice.find({
      visit: { $in: visits.map(v => v._id) },
      ...(startDate || endDate ? {
        createdAt: {
          ...(startDate ? { $gte: new Date(startDate) } : {}),
          ...(endDate ? { $lte: new Date(endDate + 'T23:59:59.999Z') } : {}),
        },
      } : {}),
    });

    const totalRevenue = invoices.reduce((sum: number, inv: any) => sum + (inv.totalPaid || 0), 0);
    const totalBilled = invoices.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0);
    const outstandingRevenue = invoices.reduce((sum: number, inv: any) => sum + (inv.outstandingBalance || 0), 0);

    // Calculate average appointments per day
    const daysDiff = startDate && endDate
      ? Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
      : 30; // Default to 30 days if no range specified
    const avgAppointmentsPerDay = daysDiff > 0 ? (totalAppointments / daysDiff).toFixed(2) : 0;

    // Calculate completion rate
    const completionRate = totalAppointments > 0
      ? ((completedAppointments / totalAppointments) * 100).toFixed(2)
      : 0;

    // Calculate no-show rate
    const noShowRate = totalAppointments > 0
      ? ((noShowAppointments / totalAppointments) * 100).toFixed(2)
      : 0;

    // Get appointment status breakdown
    const appointmentStatusBreakdown = {
      scheduled: appointments.filter(a => a.status === 'scheduled').length,
      confirmed: appointments.filter(a => a.status === 'confirmed').length,
      completed: completedAppointments,
      cancelled: cancelledAppointments,
      noShow: noShowAppointments,
    };

    // Get visit type breakdown
    const visitTypeBreakdown = visits.reduce((acc: any, visit: any) => {
      const type = visit.visitType || 'consultation';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    // Get prescription status breakdown
    const prescriptionStatusBreakdown = prescriptions.reduce((acc: any, pres: any) => {
      const status = pres.status || 'active';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    // Time-based metrics (if date range provided)
    const timeBasedMetrics = startDate && endDate ? {
      period: {
        startDate,
        endDate,
        days: daysDiff,
      },
      dailyAverage: {
        appointments: parseFloat(String(avgAppointmentsPerDay || 0)),
        visits: (totalVisits / daysDiff).toFixed(2),
        prescriptions: (totalPrescriptions / daysDiff).toFixed(2),
        revenue: (totalRevenue / daysDiff).toFixed(2),
      },
    } : null;

    const productivityReport = {
      doctor: {
        _id: doctor._id,
        name: `${doctor.firstName} ${doctor.lastName}`,
        specialization: doctor.specialization,
        status: doctor.status,
      },
      period: startDate && endDate ? { startDate, endDate } : { allTime: true },
      summary: {
        totalAppointments,
        completedAppointments,
        cancelledAppointments,
        noShowAppointments,
        scheduledAppointments,
        totalVisits,
        completedVisits,
        openVisits,
        totalPrescriptions,
        activePrescriptions,
        dispensedPrescriptions,
        totalRevenue,
        totalBilled,
        outstandingRevenue,
      },
      metrics: {
        completionRate: parseFloat(String(completionRate || 0)),
        noShowRate: parseFloat(String(noShowRate || 0)),
        avgAppointmentsPerDay: parseFloat(String(avgAppointmentsPerDay || 0)),
        revenuePerVisit: totalVisits > 0 ? (totalRevenue / totalVisits).toFixed(2) : 0,
        prescriptionsPerVisit: totalVisits > 0 ? (totalPrescriptions / totalVisits).toFixed(2) : 0,
      },
      breakdowns: {
        appointmentStatus: appointmentStatusBreakdown,
        visitType: visitTypeBreakdown,
        prescriptionStatus: prescriptionStatusBreakdown,
      },
      timeBased: timeBasedMetrics,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, data: productivityReport });
  } catch (error: any) {
    console.error('Error generating productivity report:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate productivity report' },
      { status: 500 }
    );
  }
}

