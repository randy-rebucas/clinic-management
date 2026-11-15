import { NextRequest, NextResponse, after } from 'next/server';
import { Types } from 'mongoose';
import { requireRepSession, isRepSessionError, repProfileFilter } from '../../_lib/rep-session';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import SupportRequestModel from '@/models/SupportRequest';
import { notifyPlatformTeam } from '@/lib/support';
import { supportReference } from '@/lib/platform-console';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';

type Status = 'open' | 'in-progress' | 'resolved' | 'closed';
type View = { reference: string; status: Status; requestedAt: string };

function toView(r: { _id: unknown; status: Status; createdAt: Date }): View {
  return { reference: supportReference(String(r._id)), status: r.status, requestedAt: new Date(r.createdAt).toISOString() };
}

async function openRequest(userId: Types.ObjectId): Promise<View | null> {
  const r = await SupportRequestModel.findOne({ userId, kind: 'account-deletion', status: { $in: ['open', 'in-progress'] } })
    .select('status createdAt')
    .sort({ createdAt: -1 })
    .lean<{ _id: unknown; status: Status; createdAt: Date } | null>();
  return r ? toView(r) : null;
}

/**
 * GET /api/medical-representatives/profile/deletion-request → { data: View | null }: the rep's
 * unfinished account-deletion request, if any.
 */
export async function GET() {
  const rep = await requireRepSession();
  if (isRepSessionError(rep)) return rep;
  try {
    await connectDB();
    return NextResponse.json({ success: true, data: await openRequest(rep.userObjectId) });
  } catch (error) {
    console.error('Rep deletion request lookup failed:', error);
    return NextResponse.json({ success: false, error: 'Couldn’t check your request. Please try again.' }, { status: 500 });
  }
}

/**
 * POST /api/medical-representatives/profile/deletion-request { reason? }: ask, in eMedRoute, for
 * the account to be deleted (App Store 5.1.1(v): deletion starts in the app). The platform team
 * verifies and completes it, as for the web /delete-account page; nothing is deleted here. Asking
 * again while one is open returns that one.
 */
export async function POST(request: NextRequest) {
  const rep = await requireRepSession();
  if (isRepSessionError(rep)) return rep;

  let reason: string | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    if (typeof body.reason === 'string' && body.reason.trim()) reason = body.reason.trim().slice(0, 1000);
  } catch {
    reason = undefined;
  }

  const limited = await applyRateLimit(request, rateLimiters.publicWrite, `rep-deletion:${rep.session.userId}`);
  if (limited) return limited;

  try {
    await connectDB();
    const existing = await openRequest(rep.userObjectId);
    if (existing) return NextResponse.json({ success: true, data: existing });

    const profile = await MedicalRepresentative.findOne(repProfileFilter(rep))
      .select('firstName lastName email phone company')
      .lean<{ _id: unknown; firstName?: string; lastName?: string; email?: string; phone?: string; company?: string } | null>();
    const email = profile?.email || rep.session.email;
    if (!email) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });

    const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || email;
    const subject = 'eMedRoute account deletion request';
    const message = [
      'The rep asked, in the eMedRoute app, for their account to be deleted.',
      reason ? `Reason: ${reason}` : null,
      '',
      `— Rep: ${name}${profile?.company ? ` (${profile.company})` : ''}`,
      profile?._id ? `Profile: ${String(profile._id)}` : null,
      `Email: ${email}`,
      profile?.phone ? `Mobile: ${profile.phone}` : null,
    ]
      .filter((l) => l !== null)
      .join('\n');

    const created = await SupportRequestModel.create({
      ...rep.ownerFilter,
      email,
      kind: 'account-deletion',
      subject,
      category: 'account',
      message,
      status: 'open',
      source: 'medical-rep',
      lastActivityAt: new Date(),
      lastReplyBy: 'requester',
    });
    const id = String(created._id);
    after(() => notifyPlatformTeam(id, subject, 'the eMedRoute app', email, message, true));

    const { createAuditLog } = await import('@/lib/audit');
    after(() =>
      createAuditLog({
        userId: rep.session.userId,
        action: 'create',
        resource: 'user',
        resourceId: rep.session.userId,
        description: `Rep requested eMedRoute account deletion in the app (${supportReference(id)})`,
        isSensitive: true,
      })
    );

    return NextResponse.json(
      { success: true, data: toView({ _id: id, status: 'open', createdAt: created.createdAt ?? new Date() }) },
      { status: 201 }
    );
  } catch (error) {
    console.error('Rep deletion request failed:', error);
    return NextResponse.json({ success: false, error: 'Couldn’t send your request. Please try again.' }, { status: 500 });
  }
}
