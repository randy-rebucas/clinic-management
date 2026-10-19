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
  const ticket = await SupportRequest.findOne(filter).select('status email subject tenantId').lean<any>();
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
    void notifyRequester(ticket.email, opts.id, ticket.subject, opts.message, status);
  } else {
    void notifyPlatformTeam(opts.id, ticket.subject, opts.clinicName ?? 'a clinic', opts.authorEmail, opts.message, false);
  }
  return { status };
}
