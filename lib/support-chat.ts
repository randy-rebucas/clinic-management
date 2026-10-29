import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Conversation, { supportMemberKey } from '@/models/Conversation';
import Message from '@/models/Message';
import User from '@/models/User';
import Tenant from '@/models/Tenant';
import '@/models/Role';
import { createAuditLog } from '@/lib/audit';
import { escapeRegex } from '@/lib/api/validate';
import { escapeHtml, sendEmail } from '@/lib/email';
import { resolveStaffAudience } from '@/lib/notify';
import { platformAdminEmails } from '@/lib/platform-auth';
import { sendPushToUser } from '@/lib/push-notifications';

/**
 * Support chat: each clinic staff member has one thread with the MyClinicSoft platform team,
 * started by either side. The platform team sees every support thread (never staff-to-staff
 * conversations), messages any staff member, and broadcasts into many threads at once.
 *
 * In the clinic's audit log the platform team appears as SUPPORT_AUDIT_ROLE, named by email.
 */

export const SUPPORT_AUDIT_ROLE = 'platform-support';

/** Clinics one broadcast may reach, and people in all. */
export const BROADCAST_MAX_CLINICS = 2000;
export const BROADCAST_MAX_RECIPIENTS = 5000;

const PREVIEW = 280;

// ── Threads ────────────────────────────────────────────────────────────────────

/** The staff member's support thread, created on first use. `created` is true the first time. */
export async function upsertSupportThread(tenantId: Types.ObjectId, userId: string) {
  const memberKey = supportMemberKey(userId);
  const upsert = () =>
    Conversation.findOneAndUpdate(
      { tenantId, memberKey },
      {
        $setOnInsert: {
          tenantId,
          kind: 'support',
          memberKey,
          members: [{ user: new Types.ObjectId(userId), unread: 0 }],
          support: { unread: 0 },
        },
      },
      { upsert: true, new: true, lean: true, includeResultMetadata: true }
    );
  let result;
  try {
    result = await upsert();
  } catch (error: any) {
    // Both sides starting at once race on the unique memberKey; retrying reads the winner.
    if (error?.code !== 11000) throw error;
    result = await upsert();
  }
  if (!result.value) throw new Error('Support thread upsert returned nothing');
  return { conversation: result.value as any, created: !result.lastErrorObject?.updatedExisting };
}

/**
 * A staff member wrote in their support thread: count it unread for the platform team, and email
 * the team when the thread starts waiting (not on every message). The email names who is waiting,
 * not what they wrote: chats can mention patients.
 */
export async function noteStaffMessageToSupport(conversationId: unknown, from: { name?: string; email?: string }, clinicName: string, userId: string) {
  const before = await Conversation.findOneAndUpdate(
    { _id: conversationId, kind: 'support' },
    { $inc: { 'support.unread': 1 } },
    { new: false, lean: true, projection: { support: 1 } }
  );
  if ((before as any)?.support?.unread) return;
  const to = platformAdminEmails();
  if (!to.length) return;
  const root = process.env.ROOT_DOMAIN?.split(':')[0];
  const base = process.env.NEXT_PUBLIC_APP_URL || (root ? `https://${root}` : '');
  const who = from.name || from.email || 'A staff member';
  // Not awaited: the staff member's send shouldn't wait on the mail server.
  sendEmail({
    to,
    subject: `Support chat: ${who} at ${clinicName}`,
    html: `<p>${escapeHtml(who)} at ${escapeHtml(clinicName)} wrote in support chat.</p><p><a href="${escapeHtml(`${base}/platform/chat/${userId}`)}">Open the conversation in the platform console</a></p>`,
  }).catch((error) => console.error('[support-chat] Failed to notify platform team:', error));
}

/** The staff member deleted a message for everyone: it no longer waits on the platform team. */
export async function noteStaffMessageWithdrawn(conversation: { _id: unknown; kind?: string; support?: { lastReadAt?: Date } }, sentAt: Date) {
  if (conversation.kind !== 'support') return;
  if (conversation.support?.lastReadAt && conversation.support.lastReadAt >= sentAt) return;
  await Conversation.updateOne({ _id: conversation._id, 'support.unread': { $gt: 0 } }, { $inc: { 'support.unread': -1 } });
}

// ── Platform console: reading ──────────────────────────────────────────────────

export interface SupportThreadRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  clinic: { id: string; name: string } | null;
  lastMessage: { body: string; fromSupport: boolean } | null;
  lastMessageAt: string | null;
  unread: number;
}

export type SupportChatView = 'waiting' | 'all';
const PAGE_SIZE = 30;

async function clinicNames(ids: unknown[]) {
  const rows = await Tenant.find({ _id: { $in: [...new Set(ids.map(String))] } }).select('name displayName').lean<any[]>();
  return new Map(rows.map((t) => [String(t._id), (t.displayName || t.name) as string]));
}

/** Support threads with something in them, newest first; `waiting` is those with unread messages. */
export async function listSupportThreads(opts: { view: SupportChatView; q?: string; page?: number }) {
  await connectDB();
  const filter: Record<string, unknown> = { kind: 'support', lastMessageAt: { $ne: null } };
  if (opts.view === 'waiting') filter['support.unread'] = { $gt: 0 };
  const q = opts.q?.trim().slice(0, 100);
  if (q) {
    const re = { $regex: escapeRegex(q), $options: 'i' };
    const ids = await User.find({ $or: [{ name: re }, { email: re }] }).select('_id').limit(500).lean<{ _id: Types.ObjectId }[]>();
    filter['members.user'] = { $in: ids.map((u) => u._id) };
  }
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const [rows, total, waiting] = await Promise.all([
    Conversation.find(filter).sort({ lastMessageAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean<any[]>(),
    Conversation.countDocuments(filter),
    supportWaitingCount(),
  ]);
  const users = await User.find({ _id: { $in: rows.map((r) => r.members[0]?.user) } })
    .select('name email role')
    .populate('role', 'name displayName')
    .lean<any[]>();
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const clinics = await clinicNames(rows.map((r) => r.tenantId));

  const threads: SupportThreadRow[] = rows.map((r) => {
    const uid = String(r.members[0]?.user ?? '');
    const u = userById.get(uid);
    return {
      userId: uid,
      name: u?.name || 'Former staff member',
      email: u?.email || '',
      role: u?.role?.displayName || u?.role?.name || '',
      clinic: clinics.has(String(r.tenantId)) ? { id: String(r.tenantId), name: clinics.get(String(r.tenantId))! } : null,
      lastMessage: r.lastMessage?.body ? { body: r.lastMessage.body, fromSupport: !r.lastMessage.sender } : null,
      lastMessageAt: r.lastMessageAt ? new Date(r.lastMessageAt).toISOString() : null,
      unread: r.support?.unread ?? 0,
    };
  });
  return { threads, total, waiting, page, pageSize: PAGE_SIZE };
}

/** Threads with messages the platform team hasn't read. */
export async function supportWaitingCount() {
  await connectDB();
  return Conversation.countDocuments({ kind: 'support', 'support.unread': { $gt: 0 } });
}

export interface SupportChatMessage {
  id: string;
  fromSupport: boolean;
  /** Which platform admin wrote it. */
  agentEmail: string | null;
  body: string;
  deleted: boolean;
  edited: boolean;
  createdAt: string;
}

export interface SupportChatPerson {
  userId: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  clinic: { id: string; name: string };
}

const MESSAGE_PAGE = 200;

/** A staff member and their support thread (null until either side writes). */
export async function loadSupportThread(userId: string): Promise<{ person: SupportChatPerson; messages: SupportChatMessage[]; hasOlder: boolean } | null> {
  if (!Types.ObjectId.isValid(userId)) return null;
  await connectDB();
  const user = await User.findOne({ _id: userId, tenantId: { $ne: null } })
    .select('name email role status tenantId')
    .populate('role', 'name displayName')
    .lean<any>();
  if (!user?.tenantId) return null;
  const clinics = await clinicNames([user.tenantId]);
  const person: SupportChatPerson = {
    userId: String(user._id),
    name: user.name || user.email,
    email: user.email,
    role: user.role?.displayName || user.role?.name || '',
    active: user.status === 'active',
    clinic: { id: String(user.tenantId), name: clinics.get(String(user.tenantId)) ?? 'Unknown clinic' },
  };

  const conversation = await Conversation.findOne({ tenantId: user.tenantId, memberKey: supportMemberKey(String(user._id)) }).select('_id').lean<any>();
  if (!conversation) return { person, messages: [], hasOlder: false };
  const rows = await Message.find({ tenantId: user.tenantId, conversation: conversation._id })
    .sort({ createdAt: -1, _id: -1 })
    .limit(MESSAGE_PAGE + 1)
    .lean<any[]>();
  const messages = rows.slice(0, MESSAGE_PAGE).reverse().map((m) => ({
    id: String(m._id),
    fromSupport: Boolean(m.fromSupport),
    agentEmail: m.supportAgentEmail ?? null,
    body: m.deletedAt ? '' : m.body,
    deleted: Boolean(m.deletedAt),
    edited: Boolean(m.editedAt) && !m.deletedAt,
    createdAt: new Date(m.createdAt).toISOString(),
  }));
  return { person, messages, hasOlder: rows.length > MESSAGE_PAGE };
}

/** The platform team has read the thread. */
export async function markSupportThreadRead(userId: string) {
  if (!Types.ObjectId.isValid(userId)) return;
  await connectDB();
  await Conversation.updateOne(
    { kind: 'support', memberKey: supportMemberKey(userId) },
    { $set: { 'support.unread': 0, 'support.lastReadAt': new Date() } }
  );
}

/** Active staff across every clinic, by name or email, to start a thread with. */
export async function searchStaff(q: string): Promise<SupportChatPerson[]> {
  const term = q.trim().slice(0, 100);
  if (term.length < 2) return [];
  await connectDB();
  const re = { $regex: escapeRegex(term), $options: 'i' };
  const users = await User.find({ tenantId: { $ne: null }, status: 'active', $or: [{ name: re }, { email: re }] })
    .select('name email role tenantId')
    .populate('role', 'name displayName')
    .sort({ name: 1 })
    .limit(20)
    .lean<any[]>();
  const clinics = await clinicNames(users.map((u) => u.tenantId));
  return users.map((u) => ({
    userId: String(u._id),
    name: u.name || u.email,
    email: u.email,
    role: u.role?.displayName || u.role?.name || '',
    active: true,
    clinic: { id: String(u.tenantId), name: clinics.get(String(u.tenantId)) ?? 'Unknown clinic' },
  }));
}

// ── Platform console: writing ──────────────────────────────────────────────────

function auditSupport(tenantId: Types.ObjectId, agentEmail: string, entry: { action: 'create'; resourceId?: unknown; description: string; metadata?: Record<string, unknown> }) {
  return createAuditLog({
    userEmail: agentEmail,
    userRole: SUPPORT_AUDIT_ROLE,
    tenantId,
    action: entry.action,
    resource: 'message',
    resourceId: entry.resourceId ? String(entry.resourceId) : undefined,
    description: entry.description,
    metadata: entry.metadata,
  });
}

/** Update a thread after support wrote in it: preview, the member's unread, back in their list. */
function deliveredUpdate(body: string, at: Date) {
  return {
    $set: {
      lastMessage: { body: body.slice(0, PREVIEW), createdAt: at },
      lastMessageAt: at,
      'members.0.hidden': false,
      'support.unread': 0,
      'support.lastReadAt': at,
    },
    $inc: { 'members.0.unread': 1 },
  };
}

/** The platform team writes to one staff member. */
export async function sendSupportMessage(opts: { agentEmail: string; userId: string; body: string }): Promise<{ ok: true; message: SupportChatMessage } | { ok: false; status: number; error: string }> {
  if (!Types.ObjectId.isValid(opts.userId)) return { ok: false, status: 404, error: 'Staff member not found' };
  await connectDB();
  const user = await User.findOne({ _id: opts.userId, tenantId: { $ne: null } }).select('name status tenantId').lean<any>();
  if (!user?.tenantId) return { ok: false, status: 404, error: 'Staff member not found' };
  if (user.status !== 'active') return { ok: false, status: 409, error: 'This account is inactive, so they can’t read messages.' };

  const tenantId = user.tenantId as Types.ObjectId;
  const { conversation, created } = await upsertSupportThread(tenantId, opts.userId);
  const message = await Message.create({
    tenantId,
    conversation: conversation._id,
    fromSupport: true,
    supportAgentEmail: opts.agentEmail,
    body: opts.body,
  });
  await Conversation.updateOne({ _id: conversation._id }, deliveredUpdate(message.body, message.createdAt));

  await auditSupport(tenantId, opts.agentEmail, {
    action: 'create',
    resourceId: message._id,
    description: `MyClinicSoft Support ${created ? 'started a support conversation with' : 'messaged'} ${user.name || 'a staff member'}`,
    metadata: { conversationId: String(conversation._id) },
  });

  sendPushToUser(
    opts.userId,
    {
      title: 'MyClinicSoft Support',
      body: message.body.length > 120 ? `${message.body.slice(0, 117)}...` : message.body,
      url: `/messages?c=${conversation._id}`,
      tag: `message-${conversation._id}`,
    },
    String(tenantId)
  ).catch((err) => console.error('Error sending support push:', err));

  return {
    ok: true,
    message: { id: String(message._id), fromSupport: true, agentEmail: opts.agentEmail, body: message.body, deleted: false, edited: false, createdAt: message.createdAt.toISOString() },
  };
}

/**
 * The platform team writes the same message into many staff members' support threads: the admins
 * or all staff of the chosen clinics (every active clinic when none are chosen). In-app only:
 * each recipient sees it in Messages and can reply in their thread.
 */
export async function broadcastSupportMessage(opts: {
  agentEmail: string;
  body: string;
  audience: 'admins' | 'all-staff';
  tenantIds: string[];
}): Promise<{ ok: true; clinics: number; recipients: number } | { ok: false; error: string }> {
  await connectDB();
  const filter: Record<string, unknown> = { status: 'active' };
  if (opts.tenantIds.length) filter._id = { $in: opts.tenantIds.map((id) => new Types.ObjectId(id)) };
  const tenants = await Tenant.find(filter).select('_id').limit(BROADCAST_MAX_CLINICS + 1).lean<{ _id: Types.ObjectId }[]>();
  if (!tenants.length) return { ok: false, error: 'No active clinic matches.' };
  if (tenants.length > BROADCAST_MAX_CLINICS) return { ok: false, error: `One broadcast can reach ${BROADCAST_MAX_CLINICS} clinics. Choose clinics.` };

  // Everyone first, so an over-large audience is refused before anything is sent.
  const plan: { tenantId: Types.ObjectId; userIds: string[] }[] = [];
  let total = 0;
  for (const t of tenants) {
    const userIds = await resolveStaffAudience(String(t._id), opts.audience === 'admins' ? { roles: ['admin', 'owner'] } : { allStaff: true });
    if (!userIds.length) continue;
    plan.push({ tenantId: t._id, userIds });
    total += userIds.length;
  }
  if (!total) return { ok: false, error: 'Nobody in those clinics matches.' };
  if (total > BROADCAST_MAX_RECIPIENTS) {
    return { ok: false, error: `That would reach ${total} people; one broadcast can reach ${BROADCAST_MAX_RECIPIENTS}. Choose fewer clinics or only admins.` };
  }

  const preview = opts.body.length > 80 ? `${opts.body.slice(0, 77)}...` : opts.body;
  for (const { tenantId, userIds } of plan) {
    // A few round trips per clinic, not per person.
    const keys = userIds.map(supportMemberKey);
    await Conversation.bulkWrite(
      userIds.map((uid, i) => ({
        updateOne: {
          filter: { tenantId, memberKey: keys[i] },
          update: {
            $setOnInsert: { tenantId, kind: 'support', memberKey: keys[i], members: [{ user: new Types.ObjectId(uid), unread: 0 }], support: { unread: 0 } },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    const threads = await Conversation.find({ tenantId, memberKey: { $in: keys } }).select('_id').lean<{ _id: Types.ObjectId }[]>();
    const at = new Date();
    await Message.insertMany(
      threads.map((c) => ({ tenantId, conversation: c._id, fromSupport: true, supportAgentEmail: opts.agentEmail, body: opts.body, createdAt: at, updatedAt: at })),
      { ordered: false }
    );
    await Conversation.updateMany({ _id: { $in: threads.map((c) => c._id) } }, deliveredUpdate(opts.body, at));
    await auditSupport(tenantId, opts.agentEmail, {
      action: 'create',
      description: `MyClinicSoft Support sent a broadcast to ${threads.length} ${opts.audience === 'admins' ? 'admin' : 'staff member'}${threads.length === 1 ? '' : 's'}: “${preview}”`,
      metadata: { broadcast: true, recipients: threads.length },
    });
  }

  return { ok: true, clinics: plan.length, recipients: total };
}

