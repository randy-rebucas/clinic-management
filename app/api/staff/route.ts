import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import { Nurse, Receptionist, Accountant, User } from '@/models';
import { forbiddenResponse, isAdmin } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zEmail, zPhone, zShortText } from '@/lib/api/validate';
import { checkSubscriptionLimit } from '@/lib/subscription-limits';
import { STAFF_STATUSES, STAFF_TYPE, STAFF_TYPES, isStaffStatus, type StaffRow, type StaffType } from '@/lib/staff';
import type { UserStatus } from '@/lib/users';

/** A staff roster is small; the page loads it whole and filters on the client. */
const MAX_PER_TYPE = 500;

const MODELS = { nurse: Nurse, receptionist: Receptionist, accountant: Accountant } as const;

const LIST_FIELDS =
  'firstName lastName email phone title employeeId department specialization licenseNumber certification address hireDate status createdAt';

const optionalText = z.preprocess((v) => (v === '' || v === null ? undefined : v), zShortText.optional());
const optionalDate = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.date().optional()
);

const createStaffSchema = z.object({
  staffType: z.enum(STAFF_TYPES),
  firstName: zShortText.min(1, 'First name is required'),
  lastName: zShortText.min(1, 'Last name is required'),
  email: zEmail,
  phone: zPhone,
  employeeId: optionalText,
  department: optionalText,
  specialization: optionalText,
  licenseNumber: optionalText,
  certification: optionalText,
  title: optionalText,
  address: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().trim().max(500).optional()),
  hireDate: optionalDate,
  status: z.enum(STAFF_STATUSES).optional(),
});

type LeanProfile = Record<string, unknown> & { _id: unknown; status?: string; createdAt?: Date };
type LeanAccount = {
  _id: unknown;
  status?: string;
  mustSetPassword?: boolean;
  inviteExpiresAt?: Date | null;
  lastLogin?: Date | null;
} & Record<string, unknown>;

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? v : null);

function toRow(type: StaffType, p: LeanProfile, account: LeanAccount | undefined): StaffRow {
  return {
    _id: String(p._id),
    staffType: type,
    firstName: String(p.firstName ?? ''),
    lastName: String(p.lastName ?? ''),
    email: String(p.email ?? ''),
    phone: String(p.phone ?? ''),
    title: text(p.title),
    employeeId: text(p.employeeId),
    department: text(p.department),
    specialization: text(p.specialization),
    licenseNumber: text(p.licenseNumber),
    certification: text(p.certification),
    address: text(p.address),
    hireDate: iso(p.hireDate),
    status: isStaffStatus(p.status) ? p.status : 'active',
    createdAt: iso(p.createdAt) ?? new Date(0).toISOString(),
    account: account
      ? {
          userId: String(account._id),
          status: (account.status === 'suspended' || account.status === 'inactive' ? account.status : 'active') as UserStatus,
          mustSetPassword: !!account.mustSetPassword,
          inviteExpiresAt: iso(account.inviteExpiresAt),
          lastLogin: iso(account.lastLogin),
        }
      : null,
  };
}

/**
 * GET /api/staff — admin only. Every nurse, receptionist and accountant in the clinic, each
 * with the state of their login account. `truncated` is true if a job has more than 500.
 */
export async function GET() {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { session, tenantId } = ctx;
    // Names, emails, phones and addresses of every employee: administrators only.
    if (!isAdmin(session)) return forbiddenResponse('Admin access required');

    await connectDB();

    const profiles = await Promise.all(
      STAFF_TYPES.map((type) =>
        MODELS[type].find(tenantFilter(tenantId)).select(LIST_FIELDS).sort({ lastName: 1, firstName: 1 }).limit(MAX_PER_TYPE + 1).lean<LeanProfile[]>()
      )
    );
    const truncated = profiles.some((list) => list.length > MAX_PER_TYPE);
    const lists = profiles.map((list) => list.slice(0, MAX_PER_TYPE));

    const or = STAFF_TYPES.map((type, i) => ({ [STAFF_TYPE[type].profileField]: { $in: lists[i].map((p) => p._id) } }));
    const accounts = await User.find(tenantFilter(tenantId, { $or: or }))
      .select('status mustSetPassword inviteExpiresAt lastLogin nurseProfile receptionistProfile accountantProfile')
      .lean<LeanAccount[]>();

    const byProfile = new Map<string, LeanAccount>();
    for (const a of accounts) {
      for (const type of STAFF_TYPES) {
        const ref = a[STAFF_TYPE[type].profileField];
        if (ref) byProfile.set(`${type}:${String(ref)}`, a);
      }
    }

    const rows = STAFF_TYPES.flatMap((type, i) => lists[i].map((p) => toRow(type, p, byProfile.get(`${type}:${String(p._id)}`))));
    return NextResponse.json({ success: true, data: rows, truncated });
  } catch (error) {
    console.error('Error fetching staff:', error);
    return NextResponse.json({ success: false, error: 'Failed to load the staff list' }, { status: 500 });
  }
}

/**
 * POST /api/staff — admin only. Adds a profile; the model's save hook makes the login account
 * and emails a set-password invite (or links an account this clinic already has for that email).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { session, tenantId, tenantObjectId } = ctx;

    if (!isAdmin(session)) return forbiddenResponse('Only administrators can add staff');

    await connectDB();

    const parsed = await parseBody(request, createStaffSchema);
    if (isValidationError(parsed)) return parsed;
    const { staffType, ...staffData } = parsed.data;

    const limitCheck = await checkSubscriptionLimit(tenantId, 'createUser');
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: limitCheck.reason || 'The plan’s account limit is reached, so no one else can be added.',
          limit: limitCheck.limit,
          current: limitCheck.current,
          remaining: limitCheck.remaining,
        },
        { status: 403 }
      );
    }

    // The model's post-save hook links an existing User by email; never let that reach
    // an account that belongs to another clinic.
    const existingUser = await User.findOne({ email: staffData.email }).select('tenantId').lean<{ tenantId?: unknown } | null>();
    if (existingUser && String(existingUser.tenantId ?? '') !== tenantId) {
      return NextResponse.json({ success: false, error: 'That email address is already used by another account.' }, { status: 409 });
    }

    const Model = MODELS[staffType];
    const staff = await Model.create({ ...staffData, tenantId: tenantObjectId });

    const profileField = STAFF_TYPE[staffType].profileField;
    const findAccount = () =>
      User.findOne(tenantFilter(tenantId, { [profileField]: staff._id }))
        .select('status mustSetPassword inviteExpiresAt lastLogin')
        .lean<LeanAccount | null>();
    let user = await findAccount();
    if (!user) {
      // The save hook may still be finishing; look once more before reporting no account.
      await new Promise((resolve) => setTimeout(resolve, 400));
      user = await findAccount();
    }

    const name = `${staffData.firstName} ${staffData.lastName}`;
    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'create',
      resource: 'staff',
      resourceId: String(staff._id),
      description: `Added ${name} as ${STAFF_TYPE[staffType].label.toLowerCase()}`,
      metadata: { staffType, account: user ? String(user._id) : null },
    });

    const row = toRow(staffType, staff.toObject() as LeanProfile, user ?? undefined);
    return NextResponse.json(
      {
        success: true,
        data: {
          staff: row,
          // invited: a new account waiting for its owner to set a password; linked: an account this clinic already had.
          account: !user ? 'none' : user.mustSetPassword ? 'invited' : 'linked',
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Error creating staff:', err);
    const error = err as { code?: number; name?: string } | null;
    if (error?.code === 11000) {
      return NextResponse.json({ success: false, error: 'Someone with this email is already on the staff list.' }, { status: 409 });
    }
    if (error?.name === 'ValidationError') {
      return NextResponse.json({ success: false, error: 'Some details aren’t valid. Check the form and try again.' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Failed to add the staff member' }, { status: 500 });
  }
}
