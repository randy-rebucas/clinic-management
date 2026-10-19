import { NextRequest, NextResponse } from 'next/server';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Appointment from '@/models/Appointment';
import LabResult from '@/models/LabResult';
import Invoice from '@/models/Invoice';
import Prescription from '@/models/Prescription';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth, type PatientSessionPayload } from '@/app/lib/patient-auth';
import { parsePagination, tenantScopeFilter } from '../_lib/patient-scope';
import { notificationId } from '../_lib/notification-id';
import { linkedRecords, type LinkedRecords } from '../_lib/linked-records';
import { invoiceBalance } from '../_lib/invoice-balance';

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
  /** Where the mobile app should navigate when the notification is tapped. */
  target: { screen: 'appointments' | 'lab-results' | 'invoices' | 'prescriptions'; id: string };
  metadata?: Record<string, any>;
};

const NOTIFICATION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
/** Upper bound on the stored read-id list (the feed itself is at most ~50 items per clinic). */
const MAX_READ_IDS = 500;

/**
 * On mark-all-read, a stored read id is kept only when it could belong to a clinic outside this
 * session's scope: a current-format id (`kind-<id>-<status>` / `rx-<id>`). Legacy ids from before
 * statuses were part of the id (`apt-<id>` etc.) can never match again and are dropped.
 */
function isOutOfScopeCandidate(id: string): boolean {
  return /^(apt|lab|inv)-[0-9a-f]{24}-[a-z0-9_-]+$/i.test(id) || /^rx-[0-9a-f]{24}$/i.test(id);
}

/**
 * Derive the patient's notification feed from recent clinical records (newest first).
 * `read` is resolved against the ids the patient has marked read.
 */
async function buildPatientNotifications(
  session: PatientSessionPayload,
  linked: LinkedRecords,
  readIds: string[]
): Promise<PatientNotification[]> {
  // This person's records at every clinic (one per clinic when linked by phone).
  const patientId = { $in: linked.patientIds };
  // The patient's clinics, narrowed to the session's clinic when it carries one.
  const tenantFilter = tenantScopeFilter(linked.tenantIds, session);
  const read = new Set(readIds.filter((id): id is string => typeof id === 'string'));

  const since = new Date(Date.now() - NOTIFICATION_WINDOW_MS);

  // Fetch recent clinical events in parallel
  const [appointments, labResults, unpaidInvoices, recentPrescriptions] = await Promise.all([
    Appointment.find({
      patient: patientId,
      ...tenantFilter,
      updatedAt: { $gte: since },
      status: { $in: ['confirmed', 'cancelled', 'pending', 'scheduled'] },
    })
      .select('appointmentCode appointmentDate appointmentTime status reason updatedAt')
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean(),

    LabResult.find({
      patient: patientId,
      ...tenantFilter,
      updatedAt: { $gte: since },
      // Results the patient can act on: entered (completed) or signed off (reviewed).
      status: { $in: ['completed', 'reviewed'] },
    })
      .select('request.testType status abnormalFlags orderDate updatedAt')
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean(),

    Invoice.find({
      patient: patientId,
      ...tenantFilter,
      status: { $in: ['unpaid', 'partial'] },
    })
      .select('invoiceNumber total payments status createdAt updatedAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),

    Prescription.find({
      patient: patientId,
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
    const id = notificationId('apt', (apt as any)._id, apt.status);
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
      read: read.has(id),
      target: { screen: 'appointments', id: (apt as any)._id.toString() },
      metadata: { appointmentCode: apt.appointmentCode, status: apt.status },
    });
  }

  // Map lab results to notifications
  for (const lr of labResults) {
    const id = notificationId('lab', (lr as any)._id, lr.status);
    const testName: string | undefined = (lr as any).request?.testType;
    // A value flagged high or low (LabResult has no "abnormal" status).
    const isAbnormal = Object.values((lr as any).abnormalFlags ?? {}).some((f) => f === 'high' || f === 'low');
    notifications.push({
      id,
      type: 'lab_result',
      title: isAbnormal ? 'Lab Result Requires Attention' : 'Lab Result Available',
      message: isAbnormal
        ? `Your ${testName ?? 'lab'} result has values outside the normal range. Please contact your doctor.`
        : `Your ${testName ?? 'lab'} result is now available.`,
      date: lr.updatedAt as Date,
      read: read.has(id),
      target: { screen: 'lab-results', id: (lr as any)._id.toString() },
      metadata: { testName, status: lr.status, abnormal: isAbnormal },
    });
  }

  // Map unpaid invoices to notifications
  for (const inv of unpaidInvoices) {
    const id = notificationId('inv', (inv as any)._id, inv.status);
    const { balance } = invoiceBalance(inv as any);
    notifications.push({
      id,
      type: 'invoice',
      title: 'Outstanding Balance',
      message: `Invoice #${inv.invoiceNumber ?? ''} has an outstanding balance of ${balance}.`,
      // A partial payment re-raises the notice, dated when it changed.
      date: (inv.status === 'partial' ? inv.updatedAt ?? inv.createdAt : inv.createdAt) as Date,
      read: read.has(id),
      target: { screen: 'invoices', id: (inv as any)._id.toString() },
      metadata: { invoiceNumber: inv.invoiceNumber, total: inv.total, balance, status: inv.status },
    });
  }

  // Map recent prescriptions to notifications
  for (const rx of recentPrescriptions) {
    const id = notificationId('rx', (rx as any)._id);
    notifications.push({
      id,
      type: 'prescription',
      title: 'New Prescription',
      message: 'A new prescription has been issued for you.',
      date: rx.createdAt as Date,
      read: read.has(id),
      target: { screen: 'prescriptions', id: (rx as any)._id.toString() },
    });
  }

  notifications.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return notifications;
}

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

  if (!session) return patientAuthError(request);

  try {
    await connectDB();

    const patient = await Patient.findById(session.patientId)
      .select('active tenantIds accountId readNotificationIds')
      .lean();

    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    }
    if ((patient as any).active === false) {
      await recordPatientRefused(patient as any, request, 'access');
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const { page, limit } = parsePagination(searchParams, { defaultLimit: 20, maxLimit: 50 });
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    const notifications = await buildPatientNotifications(
      session,
      await linkedRecords(patient as any),
      (patient as any).readNotificationIds ?? []
    );

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

  if (!session) return patientAuthError(request);

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
      .select('active tenantIds accountId readNotificationIds')
      .lean();

    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    }
    if ((patient as any).active === false) {
      await recordPatientRefused(patient as any, request, 'access');
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    if (body.markAllRead) {
      // Record every id in the current feed as read. Replacing (not appending) also drops
      // ids that have aged out of the feed, so the list stays bounded.
      const current = await buildPatientNotifications(session, await linkedRecords(patient as any), []);
      // Ids of other clinics' notifications (outside this session's scope) stay as they were.
      const inFeed = new Set(current.map((n) => n.id));
      const kept = ((patient as any).readNotificationIds ?? []).filter(
        (id: unknown) => typeof id === 'string' && !inFeed.has(id) && isOutOfScopeCandidate(id)
      );
      await Patient.updateOne(
        { _id: session.patientId },
        { $set: { readNotificationIds: [...kept, ...inFeed].slice(-MAX_READ_IDS) } }
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
      .filter((id): id is string => typeof id === 'string')
      .map((id) => id.trim())
      .filter((id) => id.length > 0 && id.length <= 80)
      .slice(0, 200);

    // Add to read set (addToSet prevents duplicates); keep the stored list bounded.
    await Patient.updateOne(
      { _id: session.patientId },
      { $addToSet: { readNotificationIds: { $each: sanitizedIds } } }
    );
    const stored: unknown[] = (patient as any).readNotificationIds ?? [];
    if (stored.length + sanitizedIds.length > MAX_READ_IDS) {
      await Patient.updateOne(
        { _id: session.patientId },
        { $push: { readNotificationIds: { $each: [], $slice: -MAX_READ_IDS } } }
      );
    }

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
