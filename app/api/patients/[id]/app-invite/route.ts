import { NextRequest, NextResponse, after } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import EmcrAccount from '@/models/EmcrAccount';
import EmcrInvite from '@/models/EmcrInvite';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter } from '@/lib/api/tenant-session';
import logger from '@/lib/logger';
import { normalizePhone } from '@/lib/phone';
import { FAMILY_RELATIONSHIPS, isMinor, personRecordIds } from '@/lib/patient-family';
import { maskPhone, phoneVariants } from '@/app/api/patients/auth/shared';
import {
  findUsableInvite,
  formatInviteCode,
  INVITE_TTL_DAYS,
  inviteLink,
  issueInvite,
  redeemInvite,
  revokeInvites,
  sendInviteSms,
} from '@/lib/emcr/invite';
import { generateTempPassword, setAccountPassword } from '@/lib/emcr/password';
import type { EmcrAccountLean } from '@/lib/emcr/account';
import { fullLoginId } from '@/lib/emcr/login-id';

type PatientRow = {
  _id: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date;
  phone?: string;
  active?: boolean;
};

const InviteSchema = z
  .object({
    mode: z.enum(['self', 'guardian']),
    channel: z.enum(['print', 'sms', 'both']),
    /** guardian: the parent's or carer's number (defaults to the record's). */
    phone: z.string().trim().max(30).optional(),
    dependentIds: z.array(z.string()).max(10).optional(),
    relationship: z.enum(FAMILY_RELATIONSHIPS).optional(),
    /** For a phone that can't get texts: create the account now with a printed temporary password. */
    tempPassword: z.boolean().optional(),
  })
  .strict();

const TEMP_PASSWORD_REFUSALS = {
  record_changed: 'The record changed while the invite was made. Please try again.',
  self_taken: 'This number’s eMCR account already belongs to someone else. Use a parent or carer invite, or another number.',
  used: 'Please try again.',
} as const;

/** Other minors at this clinic registered with the same phone: likely siblings, offered as extras on a guardian invite. */
async function siblingsOnPhone(tenantId: Types.ObjectId, patient: PatientRow): Promise<PatientRow[]> {
  if (!patient.phone) return [];
  const records = await Patient.find({
    _id: { $ne: patient._id },
    tenantIds: tenantId,
    phone: { $in: phoneVariants(patient.phone) },
    active: { $ne: false },
  })
    .select('firstName lastName dateOfBirth')
    .limit(20)
    .lean<PatientRow[]>();
  return records.filter((r) => isMinor(r.dateOfBirth));
}

async function load(id: string, tenantId: Types.ObjectId) {
  return Patient.findOne(patientTenantFilter(tenantId, { _id: id }))
    .select('firstName lastName dateOfBirth phone active')
    .lean<PatientRow | null>();
}

/**
 * GET /api/patients/[id]/app-invite
 *
 * Staff-only. What the "Send app invite" dialog needs: whether this person already uses the app,
 * the number on file, whether they are a minor (then the invite is usually for a parent), likely
 * siblings on the same number, and this clinic's open invite if any.
 *
 * Required permission: patients → write
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'patients', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Patient');
    const tenantId = ctx.tenantObjectId;
    const patient = await load(id, tenantId);
    if (!patient) return notFound('Patient');

    const ids = await personRecordIds(patient._id);
    const [ownAccount, managed, open, siblings] = await Promise.all([
      EmcrAccount.findOne({ selfPatientId: { $in: ids } }).select('loginId').lean<{ loginId?: string } | null>(),
      Patient.exists({ _id: { $in: ids }, 'guardians.0': { $exists: true } }).then(
        async (hasGuardians) => !!hasGuardians || !!(await EmcrAccount.exists({ 'dependents.patientId': { $in: ids } }))
      ),
      EmcrInvite.findOne({ tenantId, patientId: patient._id, usedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } })
        .select('mode channel phone expiresAt')
        .lean<{ mode: string; channel: string; phone: string; expiresAt: Date } | null>(),
      siblingsOnPhone(tenantId, patient),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: {
          hasOwnAccount: !!ownAccount,
          loginId: fullLoginId(ownAccount?.loginId),
          managedInApp: managed,
          minor: isMinor(patient.dateOfBirth),
          phone: patient.phone ?? null,
          siblings: siblings.map((s) => ({
            id: String(s._id),
            name: `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim(),
            dateOfBirth: s.dateOfBirth ? new Date(s.dateOfBirth).toISOString().slice(0, 10) : null,
          })),
          openInvite: open ? { mode: open.mode, channel: open.channel, phone: maskPhone(open.phone), expiresAt: open.expiresAt } : null,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    logger.error('Error loading app invite status', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to load the app invite status' }, { status: 500 });
  }
}

/**
 * POST /api/patients/[id]/app-invite
 * Body: { mode: 'self' | 'guardian', channel: 'print' | 'sms' | 'both', phone?, dependentIds?, relationship? }
 *
 * Staff-only. Issues a one-time eMCR invite (replacing this clinic's earlier unused one) and,
 * for `sms`/`both`, texts the link. Returns the code once, for the printed slip; only its hash
 * is kept. Redeeming needs an SMS code to the invite's phone:
 * - `self`: the record's own phone. Fix the record first if it is wrong.
 * - `guardian`: the parent's or carer's number, typed by staff (defaults to the record's).
 *
 * `tempPassword: true` (a phone that can't get texts): the account for that number is created and
 * linked right away, and a temporary password is returned once for the slip (always printed,
 * never texted). The holder signs in with the number + that password and must choose their own.
 * Refused (409) when the number's account already has a password the holder chose.
 *
 * Required permission: patients → write
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session } = ctx;
  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) return permissionCheck;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
  }
  const parsed = InviteSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Check the invite details.' }, { status: 400 });
  const body = parsed.data;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Patient');
    const tenantId = ctx.tenantObjectId;
    const patient = await load(id, tenantId);
    if (!patient) return notFound('Patient');
    if (patient.active === false) {
      return NextResponse.json({ success: false, error: 'This patient is inactive, so they can’t use the app.' }, { status: 409 });
    }

    const phone = normalizePhone(body.mode === 'guardian' && body.phone ? body.phone : patient.phone ?? '');
    if (!phone) {
      return NextResponse.json(
        {
          success: false,
          error:
            body.mode === 'self'
              ? 'This record has no valid mobile number. Update the patient’s phone first; the invite’s sign-in code goes there.'
              : 'Enter a valid mobile number for the parent or carer.',
        },
        { status: 400 }
      );
    }

    let dependentIds: Types.ObjectId[] = [];
    if (body.mode === 'guardian' && body.dependentIds?.length) {
      const allowed = new Set((await siblingsOnPhone(tenantId, patient)).map((s) => String(s._id)));
      dependentIds = [...new Set(body.dependentIds)].filter((d) => allowed.has(d)).map((d) => new Types.ObjectId(d));
    }

    const { code, expiresAt } = await issueInvite({
      tenantId,
      patientId: patient._id,
      mode: body.mode,
      phone,
      channel: body.channel,
      dependentIds,
      relationship: body.relationship,
      issuedBy: session.userId,
    });

    let tempPassword: string | null = null;
    let loginId: string | null = null;
    if (body.tempPassword) {
      const existing = await EmcrAccount.findOne({ phone }).lean<EmcrAccountLean | null>();
      if (existing?.passwordSetBy === 'user') {
        await revokeInvites(tenantId, patient._id);
        return NextResponse.json(
          {
            success: false,
            error: 'This number already has an eMCR password. They can sign in with it, or reset it with “Forgot password”.',
          },
          { status: 409 }
        );
      }
      const account =
        existing ??
        ((await EmcrAccount.findOneAndUpdate({ phone }, { $setOnInsert: { phone } }, { upsert: true, new: true }).lean()) as EmcrAccountLean);
      const found = await findUsableInvite(code);
      const linked = found.ok ? await redeemInvite(found.invite, account) : ({ ok: false, reason: 'used' } as const);
      if (!linked.ok) {
        await revokeInvites(tenantId, patient._id);
        return NextResponse.json({ success: false, error: TEMP_PASSWORD_REFUSALS[linked.reason] }, { status: 409 });
      }
      tempPassword = generateTempPassword();
      await setAccountPassword(account._id, tempPassword, 'staff', tenantId);
      const withId = await EmcrAccount.findById(account._id).select('loginId').lean<{ loginId?: string } | null>();
      loginId = fullLoginId(withId?.loginId);
    }

    const smsSent =
      body.channel === 'print' || tempPassword
        ? false
        : await sendInviteSms({ code, phone, tenantId, firstName: body.mode === 'self' ? patient.firstName : undefined });

    const { createAuditLog } = await import('@/lib/audit');
    after(() => createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId: ctx.tenantId,
      action: 'create',
      resource: 'patient',
      resourceId: id,
      dataSubject: id,
      isSensitive: true,
      description:
        `Staff issued an eMCR app invite (${body.mode === 'self' ? 'for the patient' : 'for a parent or carer'}, ` +
        `${tempPassword ? 'printed with a temporary password' : body.channel}, to ${maskPhone(phone)}${dependentIds.length ? `, plus ${dependentIds.length} more record(s)` : ''}, valid ${INVITE_TTL_DAYS} days)`,
    }));

    return NextResponse.json(
      {
        success: true,
        data: {
          code: formatInviteCode(code),
          link: inviteLink(code),
          phone: maskPhone(phone),
          // The full number goes on a temporary-password slip: it is the sign-in name.
          loginPhone: tempPassword ? phone : undefined,
          tempPassword,
          loginId,
          expiresAt,
          smsSent,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    logger.error('Error issuing eMCR app invite', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to create the app invite' }, { status: 500 });
  }
}

/**
 * DELETE /api/patients/[id]/app-invite
 *
 * Staff-only. Cancels this clinic's unused invite for the patient (a slip was lost). Accounts
 * already made from an invite are untouched.
 *
 * Required permission: patients → write
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session } = ctx;
  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Patient');
    const tenantId = ctx.tenantObjectId;
    const patient = await load(id, tenantId);
    if (!patient) return notFound('Patient');

    const revoked = await revokeInvites(tenantId, patient._id);
    if (revoked) {
      const { createAuditLog } = await import('@/lib/audit');
      after(() => createAuditLog({
        userId: session.userId,
        userEmail: session.email,
        userRole: session.role,
        tenantId: ctx.tenantId,
        action: 'delete',
        resource: 'patient',
        resourceId: id,
        dataSubject: id,
        isSensitive: true,
        description: 'Staff cancelled an unused eMCR app invite',
      }));
    }
    return NextResponse.json({ success: true, revoked });
  } catch (error) {
    logger.error('Error revoking eMCR app invite', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to cancel the app invite' }, { status: 500 });
  }
}
