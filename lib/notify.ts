import 'server-only';
import { randomUUID } from 'crypto';
import { after } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Notification, { type NotificationType, type NotificationSenderKind, type NotificationPriority } from '@/models/Notification';
import User from '@/models/User';
import Role from '@/models/Role';
import PatientMessage from '@/models/PatientMessage';

/**
 * One way to notify people, whoever is sending: the system (automations), clinic staff
 * (doctors, admins), the platform team, or support.
 *
 *  - notifyStaff: in-app notifications for clinic users, chosen by id, by role or all of them,
 *    pushed to their browsers and mobile devices when it matters.
 *  - notifyPatient: a message in the patient app's notification feed, pushed to their phone.
 *
 * Pushes run after the response; a failed push never fails the send.
 */

/** Clinic roles that may notify colleagues and message patients. */
export const STAFF_SENDER_ROLES = ['admin', 'owner', 'doctor'];

/** Most staff one call may notify (a clinic is far smaller; this bounds a mistake). */
export const MAX_STAFF_RECIPIENTS = 500;

export interface StaffAudience {
  userIds?: string[];
  /** Role names, e.g. ['doctor', 'nurse']. */
  roles?: string[];
  /** Every active staff member of the clinic. */
  allStaff?: boolean;
}

export interface NotifySender {
  kind: NotificationSenderKind;
  userId?: string;
  name?: string;
}

/** Run after the response inside a request, straight away elsewhere (cron, scripts). */
function later(task: () => Promise<unknown>) {
  const run = () => task().catch((error) => console.error('[notify] background task failed:', error));
  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * Push copies of an in-app notification to staff browsers and mobile devices. Never throws;
 * runs after the response.
 */
export function pushNotificationToStaff(
  userIds: string[],
  n: { title: string; message: string; actionUrl?: string; tenantId: string | null; tag?: string }
) {
  if (!userIds.length) return;
  later(async () => {
    const { sendPushToUser, sendPushToUserDevices } = await import('@/lib/push-notifications');
    const payload = { title: n.title, body: n.message.slice(0, 240), url: n.actionUrl ?? '/notifications', tag: n.tag };
    for (let i = 0; i < userIds.length; i += 20) {
      await Promise.allSettled(
        userIds.slice(i, i + 20).flatMap((id) => [
          sendPushToUser(id, payload, n.tenantId ?? undefined),
          sendPushToUserDevices(id, payload),
        ])
      );
    }
  });
}

/** Active staff of the clinic in the audience (deduplicated, bounded). Tenant-less = medical reps by id only. */
export async function resolveStaffAudience(tenantId: string | null, audience: StaffAudience): Promise<string[]> {
  await connectDB();
  if (!tenantId) {
    // No clinic: only named users without a clinic (medical representatives).
    const ids = (audience.userIds ?? []).filter((id) => Types.ObjectId.isValid(id));
    if (!ids.length) return [];
    const users = await User.find({ _id: { $in: ids }, status: 'active', $or: [{ tenantId: null }, { tenantId: { $exists: false } }] })
      .select('_id')
      .limit(MAX_STAFF_RECIPIENTS)
      .lean<{ _id: Types.ObjectId }[]>();
    return users.map((u) => String(u._id));
  }

  const tid = new Types.ObjectId(tenantId);
  const or: Record<string, unknown>[] = [];
  if (audience.allStaff) or.push({});
  const ids = (audience.userIds ?? []).filter((id) => Types.ObjectId.isValid(id));
  if (ids.length) or.push({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } });
  if (audience.roles?.length) {
    const roles = await Role.find({
      name: { $in: audience.roles },
      $or: [{ tenantId: tid }, { tenantId: { $exists: false } }, { tenantId: null }],
    })
      .select('_id')
      .lean<{ _id: Types.ObjectId }[]>();
    if (roles.length) or.push({ role: { $in: roles.map((r) => r._id) } });
  }
  if (!or.length) return [];

  const users = await User.find({ tenantId: tid, status: 'active', $or: or })
    .select('_id')
    .limit(MAX_STAFF_RECIPIENTS)
    .lean<{ _id: Types.ObjectId }[]>();
  return [...new Set(users.map((u) => String(u._id)))];
}

export interface NotifyStaffOptions {
  /** The clinic; null only for medical representatives, who have none. */
  tenantId: string | null;
  audience: StaffAudience;
  type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  actionUrl?: string;
  sender: NotifySender;
  /** Push to devices too. Defaults to on unless the priority is low. */
  push?: boolean;
  /** Leave the sender out of the recipients (they know what they sent). */
  excludeUserId?: string;
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
}

/** In-app notification (and push) to staff. Returns how many people it reached. */
export async function notifyStaff(opts: NotifyStaffOptions): Promise<{ recipients: number; batchId: string }> {
  const batchId = randomUUID();
  const userIds = (await resolveStaffAudience(opts.tenantId, opts.audience)).filter((id) => id !== opts.excludeUserId);
  if (!userIds.length) return { recipients: 0, batchId };

  const priority = opts.priority ?? 'normal';
  await Notification.insertMany(
    userIds.map((id) => ({
      tenantId: opts.tenantId ? new Types.ObjectId(opts.tenantId) : undefined,
      user: new Types.ObjectId(id),
      type: opts.type,
      priority,
      title: opts.title,
      message: opts.message,
      actionUrl: opts.actionUrl,
      read: false,
      sender: {
        kind: opts.sender.kind,
        userId: opts.sender.userId && Types.ObjectId.isValid(opts.sender.userId) ? new Types.ObjectId(opts.sender.userId) : undefined,
        name: opts.sender.name,
      },
      metadata: { ...opts.metadata, batchId },
      expiresAt: opts.expiresAt,
    })),
    { ordered: false }
  );

  if (opts.push ?? priority !== 'low') {
    pushNotificationToStaff(userIds, {
      title: opts.title,
      message: opts.message,
      actionUrl: opts.actionUrl,
      tenantId: opts.tenantId,
      tag: `notification-${batchId}`,
    });
  }
  return { recipients: userIds.length, batchId };
}

export interface NotifyPatientOptions {
  tenantId: string;
  patientIds: string[];
  title: string;
  message: string;
  kind?: 'message' | 'announcement';
  sender: { kind: 'staff' | 'clinic'; userId?: string; name?: string; role?: string };
  /** Push to the patients' phones. Default on. */
  push?: boolean;
}

/** Most patients one call may message. */
export const MAX_PATIENT_RECIPIENTS = 5000;

/**
 * Messages in the patient app's notification feed (and a push). Only patients of this clinic
 * receive one. Returns how many were written.
 */
export async function notifyPatients(opts: NotifyPatientOptions): Promise<{ recipients: number; batchId: string; messageIds: string[] }> {
  await connectDB();
  const batchId = randomUUID();
  const tid = new Types.ObjectId(opts.tenantId);
  const Patient = (await import('@/models/Patient')).default;
  const ids = opts.patientIds.filter((id) => Types.ObjectId.isValid(id)).slice(0, MAX_PATIENT_RECIPIENTS);
  const patients = await Patient.find({ _id: { $in: ids }, tenantIds: tid, active: { $ne: false } })
    .select('_id')
    .lean<{ _id: Types.ObjectId }[]>();
  if (!patients.length) return { recipients: 0, batchId, messageIds: [] };

  const docs = await PatientMessage.insertMany(
    patients.map((p) => ({
      tenantId: tid,
      patient: p._id,
      kind: opts.kind ?? 'message',
      title: opts.title,
      message: opts.message,
      sender: {
        kind: opts.sender.kind,
        userId: opts.sender.userId && Types.ObjectId.isValid(opts.sender.userId) ? new Types.ObjectId(opts.sender.userId) : undefined,
        name: opts.sender.name,
        role: opts.sender.role,
      },
      batchId,
    }))
  );

  if (opts.push !== false) {
    later(async () => {
      const { sendPushToPatientDevices } = await import('@/lib/push-notifications');
      for (let i = 0; i < docs.length; i += 20) {
        await Promise.allSettled(
          docs.slice(i, i + 20).map((d) =>
            sendPushToPatientDevices(
              String(d.patient),
              { title: opts.title, body: opts.message.slice(0, 240), tag: `message-${d._id}`, data: { messageId: String(d._id) } },
              { tenantId: opts.tenantId }
            )
          )
        );
      }
    });
  }
  return { recipients: docs.length, batchId, messageIds: docs.map((d) => String(d._id)) };
}
