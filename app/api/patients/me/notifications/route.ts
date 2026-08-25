import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { runAsSystem } from '@/lib/tenant-context';
import prisma from '@/lib/prisma';
import { getPatientById } from '@/lib/data/patient';
import { listAppointments } from '@/lib/data/appointment';
import { listLabResults } from '@/lib/data/lab-result';
import { listInvoices } from '@/lib/data/invoice';
import { listPrescriptions } from '@/lib/data/prescription';
import type { Prisma } from '@prisma/client';

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
    const patient = await runAsSystem(() => getPatientById(session.patientId));

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

    const patientTenantIds: string[] = (patient as any).tenantIds ?? [];
    const readIds: string[] = (patient as any).readNotificationIds ?? [];

    const tenantFilter: { tenantId?: Prisma.StringFilter | string } =
      patientTenantIds.length > 0 ? { tenantId: { in: patientTenantIds } } : {};

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // last 90 days

    // Fetch recent clinical events in parallel
    const [appointments, labResults, unpaidInvoices, recentPrescriptions] = await runAsSystem(() =>
      Promise.all([
        listAppointments({
          patientId: session.patientId,
          ...tenantFilter,
          updatedAt: { gte: since },
          status: { in: ['confirmed', 'cancelled', 'pending', 'scheduled'] },
        }),
        // Prisma's LabResultStatus enum ('ordered'/'in_progress'/'completed'/
        // 'reviewed'/'cancelled') replaced the Mongoose-era
        // 'available'/'abnormal'/'critical' values — abnormal/critical is
        // now conveyed via the `interpretation`/`abnormalFlags` fields
        // instead of status. 'completed'/'reviewed' is the closest analog
        // to "result available".
        listLabResults({
          patientId: session.patientId,
          ...tenantFilter,
          updatedAt: { gte: since },
          status: { in: ['completed', 'reviewed'] },
        }),
        listInvoices({
          patientId: session.patientId,
          ...tenantFilter,
          status: { in: ['unpaid', 'partial'] },
        }),
        listPrescriptions({
          patientId: session.patientId,
          ...tenantFilter,
          createdAt: { gte: since },
        }),
      ])
    );

    // listAppointments/listLabResults/etc already sort by their own default
    // orderBy; re-sort/trim here to mirror the original updatedAt/-1 + limit
    // semantics per event type.
    const sortedAppointments = [...appointments]
      .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 20);
    const sortedLabResults = [...labResults]
      .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 10);
    const sortedInvoices = [...unpaidInvoices]
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
    const sortedPrescriptions = [...recentPrescriptions]
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    const notifications: PatientNotification[] = [];

    // Map appointments to notifications
    for (const apt of sortedAppointments as any[]) {
      const id = `apt-${apt._id.toString()}`;
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
    for (const lr of sortedLabResults as any[]) {
      const id = `lab-${lr._id.toString()}`;
      const isAbnormal = /abnormal|critical/i.test(lr.interpretation ?? '');
      notifications.push({
        id,
        type: 'lab_result',
        title: isAbnormal ? 'Lab Result Requires Attention' : 'Lab Result Available',
        message: isAbnormal
          ? `Your ${lr.request?.testType ?? 'lab'} result is ${lr.interpretation}. Please contact your doctor.`
          : `Your ${lr.request?.testType ?? 'lab'} result is now available.`,
        date: lr.updatedAt as Date,
        read: readIds.includes(id),
        actionUrl: '/patient/portal?tab=lab-results',
        metadata: { testName: lr.request?.testType, status: lr.status },
      });
    }

    // Map unpaid invoices to notifications
    for (const inv of sortedInvoices as any[]) {
      const id = `inv-${inv._id.toString()}`;
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
    for (const rx of sortedPrescriptions as any[]) {
      const id = `rx-${rx._id.toString()}`;
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
    let body: { ids?: string[]; markAllRead?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request format' },
        { status: 400 }
      );
    }

    const patient = await runAsSystem(() =>
      prisma.patient.findUnique({
        where: { id: session.patientId },
        select: { active: true, readNotificationIds: true },
      })
    );

    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    }
    if (patient.active === false) {
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    if (body.markAllRead) {
      // Client already knows the current IDs; we clear the read list so new ones start fresh.
      // The GET endpoint will re-derive the full list on next load.
      await runAsSystem(() =>
        prisma.patient.update({
          where: { id: session.patientId },
          data: { readNotificationIds: [] },
        })
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

    // Add to read set (dedupe, matching Mongoose's $addToSet semantics)
    const merged = Array.from(new Set([...(patient.readNotificationIds ?? []), ...sanitizedIds]));
    await runAsSystem(() =>
      prisma.patient.update({
        where: { id: session.patientId },
        data: { readNotificationIds: merged },
      })
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
