import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import Invoice from '@/models/Invoice';
import Doctor from '@/models/Doctor';
import Prescription from '@/models/Prescription';
import LabResult from '@/models/LabResult';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, hasPermission } from '@/app/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
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

    // Check permissions for each resource
    const canViewPatients = await hasPermission(session, 'patients', 'read');
    const canViewAppointments = await hasPermission(session, 'appointments', 'read');
    const canViewVisits = await hasPermission(session, 'visits', 'read');
    const canViewInvoices = await hasPermission(session, 'invoices', 'read');
    const canViewDoctors = await hasPermission(session, 'doctors', 'read');
    const canViewPrescriptions = await hasPermission(session, 'prescriptions', 'read');
    const canViewLabResults = await hasPermission(session, 'lab-results', 'read');
    const canViewReports = await hasPermission(session, 'reports', 'read');

    const overview: any = {};
    const data: any = {
      period,
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      overview,
      permissions: {
        canViewPatients,
        canViewAppointments,
        canViewVisits,
        canViewInvoices,
        canViewDoctors,
        canViewPrescriptions,
        canViewLabResults,
        canViewReports,
      },
    };

    // Get tenant context from session or headers
    const { getTenantContext } = await import('@/lib/tenant');
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    const { Types } = await import('mongoose');

    // Build tenant filter
    const tenantFilter: any = {};
    if (tenantId) {
      tenantFilter.tenantId = new Types.ObjectId(tenantId);
    } else {
      tenantFilter.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }

    // Fetch data based on permissions (tenant-scoped)
    const promises: Promise<any>[] = [];

    if (canViewPatients) {
      promises.push(Patient.countDocuments(tenantFilter).then(count => ({ totalPatients: count })));
    }

    if (canViewDoctors) {
      const doctorQuery: any = { status: 'active', ...tenantFilter };
      promises.push(Doctor.countDocuments(doctorQuery).then(count => ({ totalDoctors: count })));
    }

    if (canViewAppointments) {
      promises.push(
        Appointment.countDocuments({
          ...tenantFilter,
          appointmentDate: { $gte: todayStart, $lte: todayEnd },
          status: { $in: ['scheduled', 'confirmed'] },
        }).then(count => ({ todayAppointments: count })),
        Appointment.countDocuments({
          ...tenantFilter,
          appointmentDate: { $gte: dateRange.start, $lte: dateRange.end },
        }).then(count => ({ periodAppointments: count }))
      );
    }

    if (canViewVisits) {
      promises.push(
        Visit.countDocuments({
          ...tenantFilter,
          date: { $gte: dateRange.start, $lte: dateRange.end },
          status: { $ne: 'cancelled' },
        }).then(count => ({ periodVisits: count }))
      );
    }

    if (canViewInvoices) {
      promises.push(
        Invoice.find({
          ...tenantFilter,
          createdAt: { $gte: dateRange.start, $lte: dateRange.end },
        }).then(invoices => {
          const periodRevenue = invoices.reduce((sum: number, inv: any) => sum + (inv.totalPaid || 0), 0);
          const periodBilled = invoices.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0);
          return { periodInvoices: invoices, periodRevenue, periodBilled };
        }),
        Invoice.find({
          ...tenantFilter,
          status: { $in: ['unpaid', 'partial'] },
        }).then(invoices => {
          const totalOutstanding = invoices.reduce((sum: number, inv: any) => sum + (inv.outstandingBalance || 0), 0);
          return { outstandingInvoices: invoices, totalOutstanding, outstandingInvoiceCount: invoices.length };
        })
      );
    }

    // Wait for all promises
    const results = await Promise.all(promises);
    
    // Merge results into overview
    results.forEach(result => {
      Object.assign(overview, result);
    });

    // Set defaults for missing values
    overview.totalPatients = overview.totalPatients || 0;
    overview.totalDoctors = overview.totalDoctors || 0;
    overview.todayAppointments = overview.todayAppointments || 0;
    overview.periodAppointments = overview.periodAppointments || 0;
    overview.periodVisits = overview.periodVisits || 0;
    overview.periodRevenue = parseFloat((overview.periodRevenue || 0).toFixed(2));
    overview.periodBilled = parseFloat((overview.periodBilled || 0).toFixed(2));
    overview.totalOutstanding = parseFloat((overview.totalOutstanding || 0).toFixed(2));
    overview.outstandingInvoiceCount = overview.outstandingInvoiceCount || 0;

    // Fetch appointments if permitted (tenant-scoped)
    if (canViewAppointments) {
      // Build populate options with tenant filter
      const patientPopulateOptions: any = {
        path: 'patient',
        select: 'firstName lastName',
      };
      if (tenantId) {
        patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
      } else {
        patientPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
      }
      
      const doctorPopulateOptions: any = {
        path: 'doctor',
        select: 'firstName lastName',
      };
      if (tenantId) {
        doctorPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
      } else {
        doctorPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
      }
      
      const recentAppointments = await Appointment.find({
        ...tenantFilter,
        appointmentDate: { $gte: todayStart, $lte: todayEnd },
      })
        .populate(patientPopulateOptions)
        .populate(doctorPopulateOptions)
        .sort({ appointmentTime: 1 })
        .limit(10)
        .lean();

      const nextWeek = new Date(now);
      nextWeek.setDate(now.getDate() + 7);
      const upcomingAppointments = await Appointment.find({
        ...tenantFilter,
        appointmentDate: { $gte: todayEnd, $lte: nextWeek },
        status: { $in: ['scheduled', 'confirmed'] },
      })
        .populate(patientPopulateOptions)
        .populate(doctorPopulateOptions)
        .sort({ appointmentDate: 1, appointmentTime: 1 })
        .limit(10)
        .lean();

      data.recentAppointments = recentAppointments.map((apt: any) => ({
        _id: apt._id,
        appointmentCode: apt.appointmentCode,
        patient: apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : 'Unknown',
        doctor: apt.doctor ? `Dr. ${apt.doctor.firstName} ${apt.doctor.lastName}` : 'TBD',
        date: apt.appointmentDate,
        time: apt.appointmentTime,
        status: apt.status,
      }));

      data.upcomingAppointments = upcomingAppointments.map((apt: any) => ({
        _id: apt._id,
        appointmentCode: apt.appointmentCode,
        patient: apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : 'Unknown',
        doctor: apt.doctor ? `Dr. ${apt.doctor.firstName} ${apt.doctor.lastName}` : 'TBD',
        date: apt.appointmentDate,
        time: apt.appointmentTime,
        status: apt.status,
      }));
    } else {
      data.recentAppointments = [];
      data.upcomingAppointments = [];
    }

    // Payment method breakdown for period (if invoices accessible)
    if (canViewInvoices && overview.periodInvoices) {
      const paymentMethodBreakdown: Record<string, number> = {};
      overview.periodInvoices.forEach((inv: any) => {
        inv.payments?.forEach((payment: any) => {
          const method = payment.method || 'unknown';
          paymentMethodBreakdown[method] = (paymentMethodBreakdown[method] || 0) + (payment.amount || 0);
        });
      });
      data.paymentMethodBreakdown = paymentMethodBreakdown;
    } else {
      data.paymentMethodBreakdown = {};
    }

    // Role-specific data (tenant-scoped)
    if (session.role === 'doctor') {
      // Doctor-specific: My appointments, my visits, my prescriptions
      const doctorUser = await import('@/models/User').then(m => m.default);
      const user = await doctorUser.findById(session.userId).lean();
      const staffId = (user as any)?.staff?._id;

      if (staffId) {
        // Build populate options with tenant filter
        const patientPopulateOptions: any = {
          path: 'patient',
          select: 'firstName lastName',
        };
        if (tenantId) {
          patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
        } else {
          patientPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
        }
        
        const myAppointments = await Appointment.find({
          ...tenantFilter,
          doctor: staffId,
          appointmentDate: { $gte: todayStart, $lte: todayEnd },
        })
          .populate(patientPopulateOptions)
          .sort({ appointmentTime: 1 })
          .limit(5)
          .lean();

        const myVisits = await Visit.find({
          ...tenantFilter,
          provider: staffId,
          date: { $gte: dateRange.start, $lte: dateRange.end },
        })
          .populate(patientPopulateOptions)
          .sort({ date: -1 })
          .limit(5)
          .lean();

        data.myAppointments = myAppointments.map((apt: any) => ({
          _id: apt._id,
          appointmentCode: apt.appointmentCode,
          patient: apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : 'Unknown',
          date: apt.appointmentDate,
          time: apt.appointmentTime,
          status: apt.status,
        }));

        data.myVisits = myVisits.map((visit: any) => ({
          _id: visit._id,
          patient: visit.patient ? `${visit.patient.firstName} ${visit.patient.lastName}` : 'Unknown',
          date: visit.date,
          diagnosis: visit.diagnosis || 'N/A',
        }));
      } else {
        // Fallback: log missing staff reference and prevent crash
        console.warn(`Doctor user ${session.userId} is missing staff reference. Dashboard will not show personal appointments/visits.`);
        data.myAppointments = [];
        data.myVisits = [];
      }
    }

    if (session.role === 'accountant') {
      // Accountant-specific: Financial summary (tenant-scoped)
      const allInvoices = await Invoice.find({
        ...tenantFilter,
        createdAt: { $gte: dateRange.start, $lte: dateRange.end },
      }).lean();

      const paidInvoices = allInvoices.filter((inv: any) => inv.status === 'paid');
      const unpaidInvoices = allInvoices.filter((inv: any) => inv.status === 'unpaid');
      const partialInvoices = allInvoices.filter((inv: any) => inv.status === 'partial');

      data.financialSummary = {
        totalInvoices: allInvoices.length,
        paidInvoices: paidInvoices.length,
        unpaidInvoices: unpaidInvoices.length,
        partialInvoices: partialInvoices.length,
        totalPaid: paidInvoices.reduce((sum: number, inv: any) => sum + (inv.totalPaid || 0), 0),
        totalUnpaid: unpaidInvoices.reduce((sum: number, inv: any) => sum + (inv.outstandingBalance || 0), 0),
      };
    }

    data.generatedAt = new Date().toISOString();

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    // Improved error logging and reporting
    console.error('Error generating role-based dashboard data:', error);
    let errorMessage = 'Failed to generate dashboard data';
    if (error && error.message) {
      errorMessage += `: ${error.message}`;
    }
    return NextResponse.json(
      { success: false, error: errorMessage, details: error?.stack || error },
      { status: 500 }
    );
  }
}

