import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { createAuditLog } from '@/lib/audit';
import { getClientIp } from '@/lib/middleware/rate-limit';
import { PROFILE_FIELDS, loadAccount, profileFieldOf, profileModel } from '@/lib/account';

const ProfileInput = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name.').max(60, 'Keep it under 60 characters.'),
  lastName: z.string().trim().min(1, 'Enter your last name.').max(60, 'Keep it under 60 characters.'),
  title: z.string().trim().max(20, 'Keep it under 20 characters.').optional().default(''),
  phone: z
    .string()
    .trim()
    .max(30, 'Keep it under 30 characters.')
    .refine((v) => v === '' || /^\+?[\d\s()-]{7,}$/.test(v), 'Use digits, spaces, dashes or a leading +.')
    .optional()
    .default(''),
});

/** GET /api/account/profile — the signed-in user's own account. */
export async function GET() {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();
  const account = await loadAccount(session.userId);
  if (!account) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: account });
}

/**
 * PUT /api/account/profile
 * Body: { firstName, lastName, title?, phone? }
 * Updates the user's own name (and, with a staff profile, its title and phone).
 * The sign-in email is not editable here: it identifies the account within the clinic.
 */
export async function PUT(request: NextRequest) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
  }

  const parsed = ProfileInput.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return NextResponse.json(
      { success: false, error: 'Check the highlighted fields.', fieldErrors },
      { status: 400 }
    );
  }
  const input = parsed.data;

  try {
    await connectDB();
    const user = await User.findById(session.userId)
      .select(`name ${PROFILE_FIELDS.join(' ')}`)
      .lean<{ name: string } & Record<string, unknown> | null>();
    if (!user) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });

    const name = `${input.firstName} ${input.lastName}`.trim();
    const changes: Array<{ field: string; oldValue?: unknown; newValue?: unknown }> = [];
    if (name !== user.name) changes.push({ field: 'name', oldValue: user.name, newValue: name });

    const field = profileFieldOf(user);
    if (field) {
      const { model, phoneRequired } = profileModel(field);
      if (phoneRequired && !input.phone) {
        return NextResponse.json(
          { success: false, error: 'Check the highlighted fields.', fieldErrors: { phone: ['Your clinic needs a phone number for you.'] } },
          { status: 400 }
        );
      }
      const profileId = user[field];
      const before = await model.findById(profileId).select('title phone').lean<{ title?: string; phone?: string } | null>();
      const set: Record<string, string> = { firstName: input.firstName, lastName: input.lastName };
      const unset: Record<string, 1> = {};
      for (const key of ['title', 'phone'] as const) {
        if (input[key]) set[key] = input[key];
        else unset[key] = 1;
        if ((before?.[key] ?? '') !== input[key]) changes.push({ field: key, oldValue: before?.[key], newValue: input[key] });
      }
      // updateOne skips the profile's post-save hook, which only (re)creates the linked login.
      await model.updateOne(
        { _id: profileId },
        Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set },
        { runValidators: true }
      );
    }

    await User.updateOne({ _id: session.userId }, { $set: { name } }, { runValidators: true });

    if (changes.length) {
      await createAuditLog({
        userId: session.userId,
        userEmail: session.email,
        userRole: session.role,
        tenantId: session.tenantId,
        action: 'update',
        resource: 'user',
        resourceId: session.userId,
        description: 'Updated own profile',
        changes,
        ipAddress: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent') ?? undefined,
      });
    }

    const account = await loadAccount(session.userId);
    return NextResponse.json({ success: true, data: account });
  } catch (error: any) {
    console.error('Error updating own profile:', error?.message);
    return NextResponse.json({ success: false, error: 'Could not save your profile. Try again.' }, { status: 500 });
  }
}
