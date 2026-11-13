import { after } from 'next/server';
import 'server-only';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import SupportRequest, { type SupportReplyAuthor, type SupportStatus } from '@/models/SupportRequest';
import { sendEmail, escapeHtml } from '@/lib/email';
import { platformAdminEmails } from '@/lib/platform-auth';
import { supportReference } from '@/lib/platform-console';

/** Support requests: clinics open them, the platform team answers them in the console. */

export const SUPPORT_CATEGORIES = ['general', 'technical', 'billing', 'account', 'onboarding', 'other'] as const;
export const SUPPORT_STATUSES = ['open', 'in-progress', 'resolved', 'closed'] as const;

export const NewTicketSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  category: z.enum(SUPPORT_CATEGORIES).default('general'),
  message: z.string().trim().min(10).max(10000),
});

export const ReplySchema = z.object({
  message: z.string().trim().min(1).max(10000),
  /** Platform only: set the status in the same step (e.g. reply and resolve). */
  status: z.enum(SUPPORT_STATUSES).optional(),
});

function consoleUrl(id: string): string {
  const root = process.env.ROOT_DOMAIN?.split(':')[0];
  const base = process.env.NEXT_PUBLIC_APP_URL || (root ? `https://${root}` : '');
  return `${base}/platform/support/${id}`;
}

function bodyHtml(lines: string[], message: string): string {
  return `${lines.map((l) => `<p>${l}</p>`).join('')}<blockquote style="border-left:3px solid #0ea5a4;margin:12px 0;padding:4px 12px;white-space:pre-wrap">${escapeHtml(message)}</blockquote>`;
}

/** Tell the platform team a request needs them. Failure never blocks the request. */
export async function notifyPlatformTeam(id: string, subject: string, clinicName: string, from: string, message: string, isNew: boolean) {
  const to = platformAdminEmails();
  if (!to.length) return;
  const ref = supportReference(id);
  try {
    await sendEmail({
      to,
      subject: `${isNew ? 'New support request' : 'Reply'} ${ref}: ${subject}`,
      html: bodyHtml(
        [
          `${escapeHtml(from)} at ${escapeHtml(clinicName)} ${isNew ? 'opened a support request' : 'replied'}.`,
          `<a href="${escapeHtml(consoleUrl(id))}">Open ${ref} in the platform console</a>`,
        ],
        message
      ),
    });
  } catch (error) {
    console.error('[support] Failed to notify platform team:', error);
  }
}

async function notifyRequester(to: string, id: string, subject: string, message: string, status: SupportStatus) {
  const ref = supportReference(id);
  try {
    await sendEmail({
      to,
      subject: `Re: ${subject} [${ref}]`,
      html: bodyHtml(
        [
          `The MyClinicSoft support team replied to your request ${ref}.`,
          ...(status === 'resolved' ? ['We have marked it resolved. Reply from the app if anything is still wrong.'] : []),
        ],
        message
      ),
    });
  } catch (error) {
    console.error('[support] Failed to notify requester:', error);
  }
}

/** A request a medical representative raised from the rep app (older ones carry no source, and no clinic). */
function isRepRequest(ticket: { tenantId?: unknown; source?: unknown }): boolean {
  return ticket.source === 'medical-rep' || !ticket.tenantId;
}

/**
 * The requester's in-app notification (and push): clinic staff open it on the clinic's
 * support page; medical representatives see it in the rep app's inbox (kind 'support', kept
 * REP_NOTIFICATION_TTL_DAYS), and the push opens Support (`data: { screen: 'support', id,
 * notificationId }`) unless the rep switched notifications off. Never throws.
 */
export async function notifyRequesterInApp(
  ticket: { userId?: unknown; tenantId?: unknown; source?: unknown },
  id: string,
  title: string,
  message: string
) {
  if (!ticket.userId) return;
  const rep = isRepRequest(ticket);
  try {
    const { notifyStaff } = await import('@/lib/notify');
    const { repNotificationMetadata, repNotificationExpiry } = await import('@/lib/rep-notify');
    const { recipients, batchId, notificationIds } = await notifyStaff({
      tenantId: ticket.tenantId ? String(ticket.tenantId) : null,
      audience: { userIds: [String(ticket.userId)] },
      type: 'support',
      title: title.slice(0, 200),
      message: message.slice(0, 2000),
      priority: 'high',
      actionUrl: ticket.tenantId ? `/admin/support/${id}` : undefined,
      sender: { kind: 'support', name: 'MyClinicSoft support' },
      // The rep app routes on data.screen, which the staff push doesn't carry: pushed below.
      ...(rep
        ? {
            metadata: { supportRequestId: id, ...repNotificationMetadata({ kind: 'support', screen: 'support', id }) },
            expiresAt: repNotificationExpiry(),
            push: false,
          }
        : { metadata: { supportRequestId: id } }),
    });
    if (rep && recipients > 0) {
      const push = () =>
        pushRepSupport(String(ticket.userId), id, title, message, `notification-${batchId}`, notificationIds?.[0] ?? null).catch((error) =>
          console.error('[support] rep push failed:', error)
        );
      // After the response inside a request; straight away elsewhere.
      try {
        after(push);
      } catch {
        await push();
      }
    }
  } catch (error) {
    console.error('[support] in-app notification failed:', error);
  }
}

/** Push the stored notification to the rep's phone, opening Support, unless they switched push off. */
async function pushRepSupport(userId: string, id: string, title: string, message: string, tag: string, notificationId: string | null) {
  const MedicalRepresentative = (await import('@/models/MedicalRepresentative')).default;
  const profile = await MedicalRepresentative.findOne({ userId }).select('notificationsEnabled').lean<{ notificationsEnabled?: boolean } | null>();
  if (profile?.notificationsEnabled === false) return;
  const { pushRepNotice } = await import('@/lib/rep-notify');
  await pushRepNotice(
    userId,
    { title: title.slice(0, 200), body: message.slice(0, 240), screen: 'support', id, tag, priority: 'high' },
    notificationId,
    { honorQuietHours: true }
  );
}

/**
 * Append a reply. A requester reply reopens a resolved request; a platform reply moves an
 * open request to in-progress unless a status is given.
 */
export async function addSupportReply(opts: {
  id: string;
  authorType: SupportReplyAuthor;
  authorEmail: string;
  message: string;
  status?: SupportStatus;
  tenantId?: string;
  clinicName?: string;
}) {
  if (!Types.ObjectId.isValid(opts.id)) return null;
  await connectDB();
  const filter: Record<string, unknown> = { _id: opts.id };
  if (opts.tenantId) filter.tenantId = new Types.ObjectId(opts.tenantId);
  const ticket = await SupportRequest.findOne(filter).select('status email subject tenantId userId source').lean<any>();
  if (!ticket) return null;

  let status: SupportStatus = opts.status ?? ticket.status;
  if (!opts.status) {
    if (opts.authorType === 'requester' && (ticket.status === 'resolved' || ticket.status === 'closed')) status = 'open';
    if (opts.authorType === 'platform' && ticket.status === 'open') status = 'in-progress';
  }
  const now = new Date();
  await SupportRequest.updateOne(filter, {
    $push: { replies: { authorType: opts.authorType, authorEmail: opts.authorEmail, message: opts.message, createdAt: now } },
    $set: { status, lastActivityAt: now, lastReplyBy: opts.authorType },
  });

  if (opts.authorType === 'platform') {
    after(() => notifyRequester(ticket.email, opts.id, ticket.subject, opts.message, status));
    await notifyRequesterInApp(ticket, opts.id, `Support replied: ${ticket.subject}`, opts.message);
  } else {
    after(() => notifyPlatformTeam(opts.id, ticket.subject, opts.clinicName ?? 'a clinic', opts.authorEmail, opts.message, false));
  }
  return { status };
}
