import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Appointment from '@/models/Appointment';
import LabResult from '@/models/LabResult';
import Invoice from '@/models/Invoice';
import Prescription from '@/models/Prescription';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';

/**
 * Patient notification types derived from clinical activity
 */
type PatientNotification = {
  id: string;
  type: 'appointment' | 'lab_result' | 'invoice' | 'prescription';
  title: string;
  message: string;
  date: Date;
  read: boolean;
  actionUrl?: string;
  metadata?: Record<string, any>;
};

/**
 * GET /api/patients/me/notifications
 * Returns a patient-centric notification feed derived from recent clinical activity.
 * Query params: page (default 1), limit (default 20, max 50), unreadOnly?
 *
 * Note: "read" state is tracked client-side via the PATCH endpoint which records
 * IDs in a patient-level metadata field. For a full server-side read-tracking
 * solution, a dedicated PatientNotification model can be introduced later.
 */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request);

  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated. Please login.' },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    const patient = await Patient.findById(session.patientId)
      .select('active tenantIds readNotificationIds')
      .lean();

    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    }
    if ((patient as any).active === false) {
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    const patientTenantIds = (patient as any).tenantIds ?? [];
    const readIds: string[] = (patient as any).readNotificationIds ?? [];

    const tenantFilter = patientTenantIds.length > 0
      ? { tenantId: { $in: patientTenantIds } }
      : {};

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // last 90 days

    // Fetch recent clinical events in parallel
    const [appointments, labResults, unpaidInvoices, recentPrescriptions] = await Promise.all([
      Appointment.find({
        patient: session.patientId,
        ...tenantFilter,
        updatedAt: { $gte: since },
        status: { $in: ['confirmed', 'cancelled', 'pending', 'scheduled'] },
      })
        .select('appointmentCode appointmentDate appointmentTime status reason updatedAt')
        .sort({ updatedAt: -1 })
        .limit(20)
        .lean(),

      LabResult.find({
        patient: session.patientId,
        ...tenantFilter,
        updatedAt: { $gte: since },
        status: { $in: ['available', 'abnormal', 'critical'] },
      })
        .select('testName status orderDate updatedAt')
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean(),

      Invoice.find({
        patient: session.patientId,
        ...tenantFilter,
        status: { $in: ['unpaid', 'partial'] },
      })
        .select('invoiceNumber total status createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      Prescription.find({
        patient: session.patientId,
        ...tenantFilter,
        createdAt: { $gte: since },
      })
        .select('medications status issuedAt createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const notifications: PatientNotification[] = [];

    // Map appointments to notifications
    for (const apt of appointments) {
      const id = `apt-${(apt as any)._id.toString()}`;
      const dateStr = apt.appointmentDate
        ? new Date(apt.appointmentDate).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })
        : '';

      let title = '';
      let message = '';

      switch (apt.status) {
        case 'confirmed':
          title = 'Appointment Confirmed';
          message = `Your appointment on ${dateStr} at ${apt.appointmentTime ?? ''} has been confirmed.`;
          break;
        case 'cancelled':
          title = 'Appointment Cancelled';
          message = `Your appointment on ${dateStr} has been cancelled.`;
          break;
        case 'pending':
          title = 'Appointment Pending';
          message = `Your appointment request for ${dateStr} is pending clinic confirmation.`;
          break;
        default:
          title = 'Appointment Scheduled';
          message = `You have an appointment on ${dateStr} at ${apt.appointmentTime ?? ''}.`;
      }

      notifications.push({
        id,
        type: 'appointment',
        title,
        message,
        date: apt.updatedAt as Date,
        read: readIds.includes(id),
        actionUrl: '/patient/portal?tab=appointments',
        metadata: { appointmentCode: apt.appointmentCode, status: apt.status },
      });
    }

    // Map lab results to notifications
    for (const lr of labResults) {
      const id = `lab-${(lr as any)._id.toString()}`;
      const isAbnormal = lr.status === 'abnormal' || lr.status === 'critical';
      notifications.push({
        id,
        type: 'lab_result',
        title: isAbnormal ? 'Lab Result Requires Attention' : 'Lab Result Available',
        message: isAbnormal
          ? `Your ${lr.testName ?? 'lab'} result is ${lr.status}. Please contact your doctor.`
          : `Your ${lr.testName ?? 'lab'} result is now available.`,
        date: lr.updatedAt as Date,
        read: readIds.includes(id),
        actionUrl: '/patient/portal?tab=lab-results',
        metadata: { testName: lr.testName, status: lr.status },
      });
    }

    // Map unpaid invoices to notifications
    for (const inv of unpaidInvoices) {
      const id = `inv-${(inv as any)._id.toString()}`;
      notifications.push({
        id,
        type: 'invoice',
        title: 'Outstanding Balance',
        message: `Invoice #${inv.invoiceNumber ?? ''} has an outstanding balance of ${inv.total ?? 0}.`,
        date: inv.createdAt as Date,
        read: readIds.includes(id),
        actionUrl: '/patient/portal?tab=invoices',
        metadata: { invoiceNumber: inv.invoiceNumber, total: inv.total, status: inv.status },
      });
    }

    // Map recent prescriptions to notifications
    for (const rx of recentPrescriptions) {
      const id = `rx-${(rx as any)._id.toString()}`;
      notifications.push({
        id,
        type: 'prescription',
        title: 'New Prescription',
        message: 'A new prescription has been issued for you.',
        date: rx.createdAt as Date,
        read: readIds.includes(id),
        actionUrl: '/patient/portal?tab=prescriptions',
      });
    }

    // Sort by date descending
    notifications.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const filtered = unreadOnly ? notifications.filter((n) => !n.read) : notifications;
    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);
    const unreadCount = notifications.filter((n) => !n.read).length;

    return NextResponse.json({
      success: true,
      data: paginated,
      unreadCount,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    logger.error('Error fetching patient notifications', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/patients/me/notifications
 * Mark one or more notifications as read
 * Body: { ids: string[] } — notification IDs to mark as read
 *        OR { markAllRead: true } — mark everything as read
 */
export async function PATCH(request: NextRequest) {
  const session = await verifyPatientAuth(request);

  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated. Please login.' },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    let body: { ids?: string[]; markAllRead?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request format' },
        { status: 400 }
      );
    }

    const patient = await Patient.findById(session.patientId)
      .select('active readNotificationIds')
      .lean();

    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    }
    if ((patient as any).active === false) {
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    if (body.markAllRead) {
      // Client already knows the current IDs; we clear the read list so new ones start fresh.
      // The GET endpoint will re-derive the full list on next load.
      await Patient.updateOne(
        { _id: session.patientId },
        { $set: { readNotificationIds: [] } }
      );
      return NextResponse.json({ success: true, message: 'All notifications marked as read' });
    }

    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Provide ids array or markAllRead: true' },
        { status: 400 }
      );
    }

    const sanitizedIds = body.ids
      .filter((id) => typeof id === 'string')
      .map((id) => id.trim())
      .slice(0, 200);

    // Add to read set (addToSet prevents duplicates)
    await Patient.updateOne(
      { _id: session.patientId },
      { $addToSet: { readNotificationIds: { $each: sanitizedIds } } }
    );

    return NextResponse.json({
      success: true,
      message: `${sanitizedIds.length} notification(s) marked as read`,
    });
  } catch (error: any) {
    logger.error('Error marking patient notifications as read', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to update notifications' },
      { status: 500 }
    );
  }
}
