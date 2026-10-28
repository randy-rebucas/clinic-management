import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import { Nurse, Receptionist, Accountant, MedicalTechnologist, User } from '@/models';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { revokeUserSessions } from '@/app/lib/dal';
import { createAuditLog } from '@/lib/audit';
import { changeAccountStatus } from '@/lib/account-status';
import { requireTenantSession, isTenantSessionError, tenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zEmail, zPhone, zShortText } from '@/lib/api/validate';
import { STAFF_STATUS, STAFF_STATUSES, STAFF_TYPE, STAFF_TYPES, TYPE_FIELDS, isStaffType, type StaffType } from '@/lib/staff';
import { USER_STATUSES } from '@/lib/users';

const MODELS = {
  nurse: Nurse,
  receptionist: Receptionist,
  accountant: Accountant,
  'medical-technologist': MedicalTechnologist,
} as const;

/** Optional text: '' clears the field, absent leaves it alone. */
const clearable = (max: number) => z.preprocess((v) => (v === null ? '' : v), z.string().trim().max(max).optional());

const updateStaffSchema = z.object({
  staffType: z.enum(STAFF_TYPES),
  firstName: zShortText.min(1, 'First name is required').optional(),
  lastName: zShortText.min(1, 'Last name is required').optional(),
  email: zEmail.optional(),
  phone: zPhone.optional(),
  title: clearable(200),
  employeeId: clearable(200),
  department: clearable(200),
  specialization: clearable(200),
  licenseNumber: clearable(200),
  certification: clearable(200),
  address: clearable(500),
  hireDate: z.preprocess((v) => (v === null ? '' : v), z.union([z.literal(''), z.coerce.date()]).optional()),
  status: z.enum(STAFF_STATUSES).optional(),
  /** Change the linked login account's access in the same save (audited on the account). */
  account: z
    .object({ status: z.enum(USER_STATUSES), reason: z.string().trim().max(300).optional() })
    .optional(),
});

const COMMON_TEXT = ['employeeId', 'department', 'address'] as const;
/** Changes to these are recorded by name only, never their values. */
const PRIVATE_FIELDS = new Set(['address', 'phone', 'email']);

const comparable = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ''));

async function adminContext() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return { error: ctx };
  if (!isAdmin(ctx.session)) return { error: await refuseAccess(ctx.session, 'Admin access required') };
  return { ctx };
}

/** GET /api/staff/:id?type=nurse — admin only. One profile and its login account. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx, error } = await adminContext();
    if (error) return error;
    const { tenantId } = ctx;

    const { id } = await params;
    if (!isValidId(id)) return notFound('Staff member');
    await connectDB();

    const requested = request.nextUrl.searchParams.get('type');
    const types: StaffType[] = isStaffType(requested) ? [requested] : [...STAFF_TYPES];
    for (const type of types) {
      const staff = await MODELS[type].findOne(tenantFilter(tenantId, { _id: id })).select('-internalNotes -performanceMetrics').lean();
      if (!staff) continue;
      const user = await User.findOne(tenantFilter(tenantId, { [STAFF_TYPE[type].profileField]: id }))
        .select('email name status lastLogin mustSetPassword inviteExpiresAt')
        .lean();
      return NextResponse.json({ success: true, data: { staff: { ...staff, staffType: type }, user } });
    }
    return notFound('Staff member');
  } catch (error) {
    console.error('Error fetching staff:', error);
    return NextResponse.json({ success: false, error: 'Failed to load the staff member' }, { status: 500 });
  }
}

/**
 * PUT /api/staff/:id — admin only. Updates the profile; blank optional fields are cleared.
 * Name and email follow to the login account. Employment status no longer changes sign-in by
 * itself (it used to reopen suspended and closed accounts unaudited); pass `account` to do that.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx, error } = await adminContext();
    if (error) return error;
    const { session, tenantId } = ctx;

    const { id } = await params;
    if (!isValidId(id)) return notFound('Staff member');

    const parsed = await parseBody(request, updateStaffSchema);
    if (isValidationError(parsed)) return parsed;
    const { staffType, account, ...input } = parsed.data;

    await connectDB();
    const Model = MODELS[staffType];
    const profileField = STAFF_TYPE[staffType].profileField;
    const filter = tenantFilter(tenantId, { _id: id });

    const before = await Model.findOne(filter).lean<Record<string, unknown> | null>();
    if (!before) return notFound('Staff member');

    if (input.email && input.email !== before.email) {
      const emailOwner = await User.findOne({ email: input.email })
        .select('tenantId ' + profileField)
        .lean<Record<string, unknown> | null>();
      if (emailOwner && (String(emailOwner.tenantId ?? '') !== tenantId || String(emailOwner[profileField] ?? '') !== id)) {
        return NextResponse.json({ success: false, error: 'That email address is already used by another account.' }, { status: 409 });
      }
    }

    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};
    for (const key of ['firstName', 'lastName', 'email', 'phone', 'status'] as const) {
      if (input[key] !== undefined) $set[key] = input[key];
    }
    // Only the fields this job's profile has; the others would be dropped by the model anyway.
    for (const key of [...COMMON_TEXT, ...TYPE_FIELDS[staffType]]) {
      const value = input[key];
      if (value === undefined) continue;
      if (value === '') $unset[key] = '';
      else $set[key] = value;
    }
    if (input.hireDate !== undefined) {
      if (input.hireDate === '') $unset.hireDate = '';
      else $set.hireDate = input.hireDate;
    }

    const changes = Object.keys({ ...$set, ...$unset })
      .filter((field) => comparable(before[field]) !== comparable($set[field]))
      .map((field) =>
        PRIVATE_FIELDS.has(field) ? { field } : { field, oldValue: before[field] ?? null, newValue: $set[field] ?? null }
      );

    const update: Record<string, unknown> = {};
    if (Object.keys($set).length) update.$set = $set;
    if (Object.keys($unset).length) update.$unset = $unset;
    const staff = Object.keys(update).length
      ? await Model.findOneAndUpdate(filter, update, { new: true, runValidators: true }).lean<Record<string, unknown> | null>()
      : before;
    if (!staff) return notFound('Staff member');

    const name = `${staff.firstName} ${staff.lastName}`.trim();
    const userUpdate: Record<string, unknown> = {};
    if (input.email && input.email !== before.email) userUpdate.email = input.email;
    if (input.firstName !== undefined || input.lastName !== undefined) userUpdate.name = name;

    const user = await User.findOne(tenantFilter(tenantId, { [profileField]: id })).select('_id').lean<{ _id: unknown } | null>();
    if (user && Object.keys(userUpdate).length) {
      await User.updateOne(tenantFilter(tenantId, { _id: user._id }), { $set: userUpdate });
      // A new email address is a new sign-in identity; end sessions made with the old one.
      if (userUpdate.email) await revokeUserSessions(String(user._id));
    }

    if (changes.length) {
      await createAuditLog({
        userId: session.userId,
        userEmail: session.email,
        userRole: session.role,
        tenantId,
        action: 'update',
        resource: 'staff',
        resourceId: id,
        description:
          input.status && input.status !== before.status
            ? `Marked ${name} as ${STAFF_STATUS[input.status].label.toLowerCase()}`
            : `Updated ${name}’s staff details`,
        changes,
      });
    }

    let accountError: string | null = null;
    if (account) {
      if (!user) accountError = 'They have no sign-in account, so there was no access to change.';
      else {
        const result = await changeAccountStatus({
          tenantId,
          actor: { userId: session.userId, email: session.email, role: session.role },
          userId: String(user._id),
          status: account.status,
          reason: account.reason || undefined,
        });
        if (!result.ok) accountError = result.error;
      }
    }

    return NextResponse.json({
      success: true,
      data: { staff: { ...staff, staffType }, changed: changes.length, accountError },
    });
  } catch (err) {
    console.error('Error updating staff:', err);
    const error = err as { code?: number; name?: string } | null;
    if (error?.code === 11000) {
      return NextResponse.json({ success: false, error: 'Someone with this email is already on the staff list.' }, { status: 409 });
    }
    if (error?.name === 'ValidationError') {
      return NextResponse.json({ success: false, error: 'Some details aren’t valid. Check the form and try again.' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Failed to save the staff member' }, { status: 500 });
  }
}

/**
 * DELETE /api/staff/:id?type=nurse — admin only. For someone added by mistake: removes the
 * profile and its never-used account. Anyone who has set a password or signed in may be named
 * on records, so they are marked inactive and their account closed instead (409).
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx, error } = await adminContext();
    if (error) return error;
    const { session, tenantId } = ctx;

    const { id } = await params;
    if (!isValidId(id)) return notFound('Staff member');
    const staffType = request.nextUrl.searchParams.get('type');
    if (!isStaffType(staffType)) {
      return NextResponse.json({ success: false, error: 'Staff type is required' }, { status: 400 });
    }

    await connectDB();
    const Model = MODELS[staffType];
    const profileField = STAFF_TYPE[staffType].profileField;

    const staff = await Model.findOne(tenantFilter(tenantId, { _id: id })).select('firstName lastName').lean<{ firstName: string; lastName: string } | null>();
    if (!staff) return notFound('Staff member');
    const name = `${staff.firstName} ${staff.lastName}`.trim();

    const user = await User.findOne(tenantFilter(tenantId, { [profileField]: id }))
      .select('_id lastLogin mustSetPassword')
      .lean<{ _id: unknown; lastLogin?: Date | null; mustSetPassword?: boolean } | null>();
    if (user && String(user._id) === session.userId) {
      return NextResponse.json({ success: false, error: 'You can’t remove your own profile.' }, { status: 400 });
    }
    if (user && (user.lastLogin || !user.mustSetPassword)) {
      return NextResponse.json(
        {
          success: false,
          error: `${name} has used their account, so their name may be on records here. Mark them inactive and close their sign-in instead.`,
        },
        { status: 409 }
      );
    }

    await Model.deleteOne(tenantFilter(tenantId, { _id: id }));
    if (user) {
      await User.deleteOne(tenantFilter(tenantId, { _id: user._id }));
      await revokeUserSessions(String(user._id));
    }

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'delete',
      resource: 'staff',
      resourceId: id,
      description: `Removed ${name} (${STAFF_TYPE[staffType].label.toLowerCase()}) from the staff list${user ? ' with their unused account' : ''}`,
    });

    return NextResponse.json({ success: true, data: { removed: id } });
  } catch (error) {
    console.error('Error deleting staff:', error);
    return NextResponse.json({ success: false, error: 'Failed to remove the staff member' }, { status: 500 });
  }
}
