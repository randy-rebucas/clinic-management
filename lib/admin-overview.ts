import 'server-only';
import mongoose, { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Role from '@/models/Role';
import Tenant from '@/models/Tenant';
import AuditLog from '@/models/AuditLog';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { dayRangeInTz, dayRangeOffsetInTz, formatInTz } from '@/lib/tz';
import { checkSubscriptionStatus } from '@/lib/subscription';
import { getSubscriptionUsage } from '@/lib/subscription-limits';
import { isEmailConfigured } from '@/lib/email';
import { isSMSConfigured } from '@/lib/sms';
import { isCloudinaryConfigured } from '@/lib/cloudinary';
import { IDLE_DAYS, NEAR_LIMIT, TREND_DAYS } from '@/lib/admin-overview.shared';
import { buildUsageRows, type UsageRow } from '@/lib/plan-usage';
import { BLOCKED_WHEN_UNPAID, PLAN_LABEL } from '@/lib/subscription-period';

/**
 * Everything /admin shows, read straight from the clinic's records: who can sign in, how
 * sign-ins went over the last two weeks, what the plan allows and how much of it is used,
 * which outside services this server can reach, and the recent administrative changes.
 * Replaces /api/admin/{stats,health,activity}, which returned random and hard-coded figures.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type { UsageRow };

const OVERVIEW_USAGE: UsageRow['key'][] = ['users', 'doctors', 'patients', 'appointments', 'storage'];

export interface ServiceRow {
  key: 'database' | 'email' | 'sms' | 'files';
  label: string;
  ok: boolean;
  detail: string;
}

export interface ActivityRow {
  id: string;
  at: string;
  /** "9:41 AM", "Yesterday, 3:12 PM", "Oct 3, 3:12 PM", in the clinic's time zone. */
  when: string;
  who: string;
  what: string;
  detail: string | null;
  success: boolean;
}

export interface AttentionItem {
  key: string;
  tone: 'red' | 'amber';
  text: string;
  detail?: string;
  href?: string;
  action?: string;
}

export interface AdminOverview {
  clinicName: string;
  today: string;
  accounts: {
    /** Everyone who can be signed in as: active and suspended accounts. */
    total: number;
    active: number;
    suspended: number;
    inactive: number;
    byRole: Record<string, number>;
    invitesWaiting: number;
    invitesExpired: number;
    withTwoStep: number;
    adminsWithoutTwoStep: { id: string; name: string; isYou: boolean }[];
    idle: number;
    signedInWeek: number;
  };
  signIns: { date: string; signIns: number; refused: number }[];
  plan: {
    plan: string | null;
    label: string;
    status: 'active' | 'cancelled' | 'expired';
    expiresAt: string | null;
    /** "Oct 31, 2026" in the clinic's time zone. */
    expiresOn: string | null;
    daysRemaining: number | null;
    usage: UsageRow[] | null;
  };
  services: ServiceRow[];
  activity: ActivityRow[];
  attention: AttentionItem[];
}

/** Audit entries an administrator answers for; routine record work stays in the audit log. */
const ADMIN_ACTIONS = ['permission_change', 'backup', 'restore', 'data_export', 'data_deletion', 'access_denied', 'password_change'];

function describe(action: string, resource: string): string {
  switch (action) {
    case 'permission_change':
      return 'Changed permissions';
    case 'backup':
      return 'Made a backup';
    case 'restore':
      return 'Restored a backup';
    case 'data_export':
      return 'Exported data';
    case 'data_deletion':
      return 'Deleted data';
    case 'access_denied':
      return 'Was refused access';
    case 'password_change':
      return 'Changed a password';
  }
  if (resource === 'user') {
    return action === 'create' ? 'Added an account' : action === 'delete' ? 'Removed an account' : 'Changed an account';
  }
  return action === 'create' ? 'Added a setting' : action === 'delete' ? 'Removed a setting' : 'Changed settings';
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

async function pingDatabase(): Promise<ServiceRow> {
  const started = Date.now();
  try {
    await mongoose.connection.db?.command({ ping: 1 });
    return { key: 'database', label: 'Database', ok: true, detail: `Answered in ${Date.now() - started} ms` };
  } catch {
    return { key: 'database', label: 'Database', ok: false, detail: 'Did not answer a check just now' };
  }
}

export async function loadAdminOverview(session: { userId: string; tenantId?: string | null }): Promise<AdminOverview> {
  await connectDB();
  if (!session.tenantId || !Types.ObjectId.isValid(session.tenantId)) {
    throw new Error('This account is not linked to a clinic');
  }
  const tenantId = new Types.ObjectId(session.tenantId);
  const tz = await getTenantTimezone(tenantId);
  const now = new Date();
  const today = formatInTz(now, 'yyyy-MM-dd', tz);
  const trendStart = dayRangeOffsetInTz(-(TREND_DAYS - 1), now, tz).start;
  const trendEnd = dayRangeInTz(now, tz).end;
  const idleBefore = new Date(now.getTime() - IDLE_DAYS * DAY_MS);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const live = { tenantId, status: { $ne: 'inactive' } };

  void Role; // registered for $lookup / populate

  const adminRoleIds = (
    await Role.find({ tenantId, name: { $in: ['admin', 'owner'] } }).select('_id').lean<{ _id: Types.ObjectId }[]>()
  ).map((r) => r._id);

  const [
    tenant,
    statusCounts,
    roleCounts,
    invitesWaiting,
    invitesExpired,
    withTwoStep,
    adminsWithoutTwoStep,
    idle,
    signedInWeek,
    signInDays,
    activityLogs,
    subscription,
    usage,
    database,
  ] = await Promise.all([
    Tenant.findById(tenantId).select('name displayName').lean<{ name?: string; displayName?: string } | null>(),
    User.aggregate<{ _id: string; n: number }>([{ $match: { tenantId } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    User.aggregate<{ _id: string | null; n: number }>([
      { $match: live },
      { $lookup: { from: Role.collection.name, localField: 'role', foreignField: '_id', as: 'r' } },
      { $group: { _id: { $ifNull: [{ $arrayElemAt: ['$r.displayName', 0] }, { $arrayElemAt: ['$r.name', 0] }] }, n: { $sum: 1 } } },
    ]),
    User.countDocuments({ ...live, mustSetPassword: true, $or: [{ inviteExpiresAt: { $gte: now } }, { inviteExpiresAt: null }] }),
    User.countDocuments({ ...live, mustSetPassword: true, inviteExpiresAt: { $lt: now } }),
    User.countDocuments({ ...live, totpEnabled: true }),
    adminRoleIds.length
      ? User.find({ ...live, role: { $in: adminRoleIds }, totpEnabled: { $ne: true }, mustSetPassword: { $ne: true } })
          .select('name')
          .sort({ name: 1 })
          .lean<{ _id: Types.ObjectId; name: string }[]>()
      : Promise.resolve([]),
    User.countDocuments({
      tenantId,
      status: 'active',
      mustSetPassword: { $ne: true },
      $or: [{ lastLogin: { $lt: idleBefore } }, { lastLogin: null, createdAt: { $lt: idleBefore } }],
    }),
    User.countDocuments({ ...live, lastLogin: { $gte: weekAgo } }),
    AuditLog.aggregate<{ _id: { day: string; action: string }; n: number }>([
      {
        $match: {
          tenantId,
          timestamp: { $gte: trendStart, $lte: trendEnd },
          // Refused sign-ins are logged as unsuccessful logins; only real ones count here.
          $or: [{ action: 'login', success: { $ne: false } }, { action: 'access_denied' }],
        },
      },
      {
        $group: {
          _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: tz } }, action: '$action' },
          n: { $sum: 1 },
        },
      },
    ]),
    AuditLog.find({
      tenantId,
      $or: [
        { action: { $in: ADMIN_ACTIONS } },
        { resource: 'user', action: { $in: ['create', 'update', 'delete'] } },
        { resource: 'system', action: { $in: ['create', 'update', 'delete'] } },
      ],
    })
      .select('userId userEmail action resource description success timestamp')
      .sort({ timestamp: -1 })
      .limit(8)
      .lean<
        {
          _id: Types.ObjectId;
          userId?: Types.ObjectId;
          userEmail?: string;
          action: string;
          resource: string;
          description?: string;
          success?: boolean;
          timestamp: Date;
        }[]
      >(),
    checkSubscriptionStatus(tenantId),
    getSubscriptionUsage(tenantId).catch((error) => {
      console.error('Admin overview: usage unavailable', error);
      return null;
    }),
    pingDatabase(),
  ]);

  // --- Accounts -------------------------------------------------------------------------
  const byStatus = Object.fromEntries(statusCounts.map((s) => [s._id, s.n])) as Record<string, number>;
  const active = byStatus.active ?? 0;
  const suspended = byStatus.suspended ?? 0;
  const byRole: Record<string, number> = {};
  for (const r of roleCounts) byRole[r._id || 'No role'] = (byRole[r._id || 'No role'] ?? 0) + r.n;

  // --- Sign-ins per day -----------------------------------------------------------------
  const perDay = new Map<string, { signIns: number; refused: number }>();
  for (const row of signInDays) {
    const cell = perDay.get(row._id.day) ?? { signIns: 0, refused: 0 };
    if (row._id.action === 'login') cell.signIns += row.n;
    else cell.refused += row.n;
    perDay.set(row._id.day, cell);
  }
  const signIns = Array.from({ length: TREND_DAYS }, (_, i) => {
    const date = formatInTz(dayRangeOffsetInTz(i - (TREND_DAYS - 1), now, tz).start, 'yyyy-MM-dd', tz);
    return { date, ...(perDay.get(date) ?? { signIns: 0, refused: 0 }) };
  });

  // --- Activity: name the person, not only their email ---------------------------------
  const userIds = [...new Set(activityLogs.map((l) => l.userId?.toString()).filter(Boolean))] as string[];
  const names = new Map(
    (await User.find({ _id: { $in: userIds }, tenantId }).select('name').lean<{ _id: Types.ObjectId; name: string }[]>()).map((u) => [
      u._id.toString(),
      u.name,
    ])
  );
  const yesterday = formatInTz(dayRangeOffsetInTz(-1, now, tz).start, 'yyyy-MM-dd', tz);
  // Times are written here, in the clinic's zone, so server and browser render the same words.
  const when = (at: Date) => {
    const day = formatInTz(at, 'yyyy-MM-dd', tz);
    const time = formatInTz(at, 'h:mm a', tz);
    if (day === today) return time;
    if (day === yesterday) return `Yesterday, ${time}`;
    return `${formatInTz(at, day.slice(0, 4) === today.slice(0, 4) ? 'MMM d' : 'MMM d, yyyy', tz)}, ${time}`;
  };
  const activity: ActivityRow[] = activityLogs.map((log) => ({
    id: log._id.toString(),
    at: new Date(log.timestamp).toISOString(),
    when: when(new Date(log.timestamp)),
    who:
      log.userId?.toString() === session.userId
        ? 'You'
        : names.get(log.userId?.toString() ?? '') || log.userEmail || 'Someone no longer on file',
    what: describe(log.action, log.resource),
    detail: log.description?.trim() || null,
    success: log.success !== false,
  }));

  // --- Plan -----------------------------------------------------------------------------
  // Bookings today and visits are on the subscription page; the overview keeps the five that fill up.
  const usageRows: UsageRow[] | null = usage
    ? buildUsageRows(usage).filter((row) => OVERVIEW_USAGE.includes(row.key))
    : null;
  const planStatus: AdminOverview['plan']['status'] = subscription.isExpired ? 'expired' : subscription.status ?? 'expired';

  // --- Services -------------------------------------------------------------------------
  const services: ServiceRow[] = [
    database,
    isEmailConfigured()
      ? { key: 'email', label: 'Email', ok: true, detail: 'Invites, reminders and results go out by email' }
      : { key: 'email', label: 'Email', ok: false, detail: 'Not set up on this server: invites, reminders and results aren’t emailed' },
    isSMSConfigured()
      ? { key: 'sms', label: 'Text messages', ok: true, detail: 'Reminders and queue calls go out by SMS' }
      : { key: 'sms', label: 'Text messages', ok: false, detail: 'Not set up on this server: no SMS reminders or queue calls' },
    isCloudinaryConfigured()
      ? { key: 'files', label: 'File storage', ok: true, detail: 'Uploads are kept in the clinic’s file store' }
      : { key: 'files', label: 'File storage', ok: false, detail: 'Not set up on this server: uploads are kept in the database' },
  ];

  // --- What needs the admin -------------------------------------------------------------
  const attention: AttentionItem[] = [];
  const planLabel = subscription.plan ? PLAN_LABEL[subscription.plan] ?? subscription.plan : 'No plan';
  const endsOn = subscription.expiresAt ? formatInTz(subscription.expiresAt, 'MMM d', tz) : null;
  if (planStatus === 'cancelled') {
    attention.push({
      key: 'plan',
      tone: 'red',
      text: `The ${planLabel} plan was cancelled: its payment was refunded or declined`,
      detail: `Staff can still open records, but can’t add ${BLOCKED_WHEN_UNPAID} until a plan is paid for.`,
      href: '/admin/subscription',
      action: 'Pay for a plan',
    });
  } else if (subscription.isExpired || planStatus !== 'active') {
    attention.push({
      key: 'plan',
      tone: 'red',
      text: subscription.plan ? `The ${planLabel} plan has ended` : 'The clinic has no active plan',
      detail: `Staff can still open records, but can’t add ${BLOCKED_WHEN_UNPAID} until it is paid for.`,
      href: '/admin/subscription',
      action: 'Renew',
    });
  } else if (subscription.daysRemaining !== null && subscription.daysRemaining <= 14) {
    attention.push({
      key: 'plan',
      tone: 'amber',
      text: `The ${planLabel} plan ends in ${plural(subscription.daysRemaining, 'day')}${endsOn ? ` (${endsOn})` : ''}`,
      href: '/admin/subscription',
      action: 'Renew',
    });
  }
  for (const row of usageRows ?? []) {
    if (row.limit === null || row.limit <= 0) continue;
    const share = row.current / row.limit;
    if (share >= 1) {
      attention.push({ key: `usage-${row.key}`, tone: 'red', text: `${row.label}: the plan’s limit is reached`, detail: `Until the plan changes, ${row.blocks}.`, href: '/admin/subscription', action: 'Change plan' });
    } else if (share >= NEAR_LIMIT) {
      attention.push({ key: `usage-${row.key}`, tone: 'amber', text: `${row.label}: ${Math.round(share * 100)}% of the plan’s limit used`, href: '/admin/subscription', action: 'See plans' });
    }
  }
  if (!database.ok) {
    attention.push({ key: 'database', tone: 'red', text: 'The database did not answer a check', detail: 'If this repeats, staff will see errors when saving.' });
  }
  const unprotected = adminsWithoutTwoStep.map((u) => ({ id: u._id.toString(), name: u.name, isYou: u._id.toString() === session.userId }));
  if (unprotected.length) {
    const you = unprotected.find((u) => u.isYou);
    attention.push({
      key: 'two-step',
      tone: 'amber',
      text: `${plural(unprotected.length, 'administrator account')} ${unprotected.length === 1 ? 'signs' : 'sign'} in without two-step verification`,
      detail: unprotected.map((u) => (u.isYou ? 'You' : u.name)).join(', '),
      href: you ? '/settings' : '/admin/users?show=no-two-step',
      action: you ? 'Turn it on for you' : 'Open users',
    });
  }
  if (invitesExpired) {
    attention.push({
      key: 'invites',
      tone: 'amber',
      text: `${plural(invitesExpired, 'invite')} ran out before ${invitesExpired === 1 ? 'it was' : 'they were'} accepted`,
      detail: 'Those people can’t sign in until they are invited again.',
      href: '/admin/users?show=invite-expired',
      action: 'Open users',
    });
  }
  if (idle) {
    attention.push({
      key: 'idle',
      tone: 'amber',
      text: `${plural(idle, 'account')} not used in ${IDLE_DAYS} days`,
      detail: 'Access nobody uses should be closed. Mark the account inactive if the person has left.',
      href: '/admin/users?show=idle',
      action: 'Review',
    });
  }

  return {
    clinicName: tenant?.displayName || tenant?.name || 'Your clinic',
    today,
    accounts: {
      total: active + suspended,
      active,
      suspended,
      inactive: byStatus.inactive ?? 0,
      byRole,
      invitesWaiting,
      invitesExpired,
      withTwoStep,
      adminsWithoutTwoStep: unprotected,
      idle,
      signedInWeek,
    },
    signIns,
    plan: {
      plan: subscription.plan,
      label: planLabel,
      status: planStatus,
      expiresAt: subscription.expiresAt ? new Date(subscription.expiresAt).toISOString() : null,
      expiresOn: subscription.expiresAt ? formatInTz(subscription.expiresAt, 'MMM d, yyyy', tz) : null,
      daysRemaining: subscription.daysRemaining,
      usage: usageRows,
    },
    services,
    activity,
    attention: attention.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'red' ? -1 : 1)),
  };
}
