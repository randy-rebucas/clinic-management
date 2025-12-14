import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import Invoice from '@/models/Invoice';
import Doctor from '@/models/Doctor';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to read reports
  const permissionCheck = await requirePermission(session, 'reports', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'today'; // today, week, month

    // Calculate date range
    const now = new Date();
    let dateRange: { start: Date; end: Date };
    
    switch (period) {
      case 'week':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        dateRange = { start: weekStart, end: weekEnd };
        break;
      case 'month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        monthStart.setHours(0, 0, 0, 0);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);
        dateRange = { start: monthStart, end: monthEnd };
        break;
      case 'today':
      default:
        dateRange = {
          start: new Date(now.setHours(0, 0, 0, 0)),
          end: new Date(now.setHours(23, 59, 59, 999)),
        };
        break;
    }

    // Get today's date for today-specific queries
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Build tenant filter
    const tenantFilter: any = {};
    if (tenantId) {
      tenantFilter.tenantId = new Types.ObjectId(tenantId);
    } else {
      tenantFilter.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }

    // Fetch all data in parallel with tenant filter
    const [
      totalPatients,
      totalDoctors,
      todayAppointments,
      periodAppointments,
      periodVisits,
      periodInvoices,
      outstandingInvoices,
    ] = await Promise.all([
      Patient.countDocuments(tenantFilter),
      Doctor.countDocuments({ ...tenantFilter, status: 'active' }),
      Appointment.countDocuments({
        ...tenantFilter,
        appointmentDate: { $gte: todayStart, $lte: todayEnd },
        status: { $in: ['scheduled', 'confirmed'] },
      }),
      Appointment.countDocuments({
        ...tenantFilter,
        appointmentDate: { $gte: dateRange.start, $lte: dateRange.end },
      }),
      Visit.countDocuments({
        ...tenantFilter,
        date: { $gte: dateRange.start, $lte: dateRange.end },
        status: { $ne: 'cancelled' },
      }),
      Invoice.find({
        ...tenantFilter,
        createdAt: { $gte: dateRange.start, $lte: dateRange.end },
      }),
      Invoice.find({
        ...tenantFilter,
        status: { $in: ['unpaid', 'partial'] },
      }),
    ]);

    // Calculate revenue metrics
    const periodRevenue = periodInvoices.reduce((sum: number, inv: any) => sum + (inv.totalPaid || 0), 0);
    const periodBilled = periodInvoices.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0);
    const totalOutstanding = outstandingInvoices.reduce((sum: number, inv: any) => sum + (inv.outstandingBalance || 0), 0);

    // Recent appointments (today) with tenant filter
    const recentAppointments = await Appointment.find({
      ...tenantFilter,
      appointmentDate: { $gte: todayStart, $lte: todayEnd },
    })
      .populate('patient', 'firstName lastName')
      .populate('doctor', 'firstName lastName')
      .sort({ appointmentTime: 1 })
      .limit(10);

    // Upcoming appointments (next 7 days) with tenant filter
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);
    const upcomingAppointments = await Appointment.find({
      ...tenantFilter,
      appointmentDate: { $gte: todayEnd, $lte: nextWeek },
      status: { $in: ['scheduled', 'confirmed'] },
    })
      .populate('patient', 'firstName lastName')
      .populate('doctor', 'firstName lastName')
      .sort({ appointmentDate: 1, appointmentTime: 1 })
      .limit(10);

    // Payment method breakdown for period
    const paymentMethodBreakdown: Record<string, number> = {};
    periodInvoices.forEach((inv: any) => {
      inv.payments?.forEach((payment: any) => {
        const method = payment.method || 'unknown';
        paymentMethodBreakdown[method] = (paymentMethodBreakdown[method] || 0) + (payment.amount || 0);
      });
    });

    return NextResponse.json({
      success: true,
      data: {
        period,
        dateRange: {
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString(),
        },
        overview: {
          totalPatients,
          totalDoctors,
          todayAppointments,
          periodAppointments,
          periodVisits,
          periodRevenue: parseFloat(periodRevenue.toFixed(2)),
          periodBilled: parseFloat(periodBilled.toFixed(2)),
          totalOutstanding: parseFloat(totalOutstanding.toFixed(2)),
          outstandingInvoiceCount: outstandingInvoices.length,
        },
        recentAppointments: recentAppointments.map((apt: any) => ({
          _id: apt._id,
          appointmentCode: apt.appointmentCode,
          patient: apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : 'Unknown',
          doctor: apt.doctor ? `Dr. ${apt.doctor.firstName} ${apt.doctor.lastName}` : 'TBD',
          date: apt.appointmentDate,
          time: apt.appointmentTime,
          status: apt.status,
        })),
        upcomingAppointments: upcomingAppointments.map((apt: any) => ({
          _id: apt._id,
          appointmentCode: apt.appointmentCode,
          patient: apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : 'Unknown',
          doctor: apt.doctor ? `Dr. ${apt.doctor.firstName} ${apt.doctor.lastName}` : 'TBD',
          date: apt.appointmentDate,
          time: apt.appointmentTime,
          status: apt.status,
        })),
        paymentMethodBreakdown,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error generating dashboard data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate dashboard data' },
      { status: 500 }
    );
  }
}

