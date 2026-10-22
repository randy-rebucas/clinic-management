import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { sendBroadcastMessage } from '@/lib/automations/broadcast-messaging';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, patientTenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId, escapeRegex } from '@/lib/api/validate';
import { checkSubscriptionLimit } from '@/lib/subscription-limits';
import { consumeRateLimit } from '@/lib/middleware/rate-limit';

/** Per clinic: each broadcast texts and emails every patient in the group at the platform's cost. */
const BROADCAST_LIMIT = { name: 'broadcast', windowMs: 60 * 60 * 1000, maxRequests: 5, identifierOnly: true };

const broadcastSchema = z.object({
  message: z.string().trim().min(1).max(5000),
  subject: z.string().trim().max(200).optional(),
  targetGroup: z
    .object({
      type: z.enum(['all', 'ageRange', 'condition', 'lastVisit', 'custom']),
      minAge: z.number().int().min(0).max(150).optional(),
      maxAge: z.number().int().min(0).max(150).optional(),
      // The automation builds a RegExp from this, so it is length-bounded and escaped here.
      condition: z.string().trim().min(1).max(100).optional(),
      daysSinceLastVisit: z.number().int().min(1).max(3650).optional(),
      patientIds: z.array(zObjectId).max(1000).optional(),
    })
    .optional(),
  sendSMS: z.boolean().optional(),
  sendEmail: z.boolean().optional(),
  sendNotification: z.boolean().optional(),
});

/**
 * Send broadcast message to patient group. Admin only.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  if (!isAdmin(ctx.session)) {
    return refuseAccess(ctx.session, 'Admin access required to send broadcasts');
  }

  const parsed = await parseBody(request, broadcastSchema);
  if (isValidationError(parsed)) return parsed;
  const body = parsed.data;

  const plan = await checkSubscriptionLimit(ctx.tenantId, 'useFeature', 'broadcastMessaging');
  if (!plan.allowed) {
    return NextResponse.json(
      { success: false, code: 'PLAN_REQUIRED', error: plan.reason || 'Broadcast messages need a Professional or Enterprise plan.' },
      { status: 403 }
    );
  }
  const limit = await consumeRateLimit(BROADCAST_LIMIT, '', ctx.tenantId);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many broadcasts this hour. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((limit.resetTime - Date.now()) / 1000))) } }
    );
  }

  try {
    await connectDB();

    let targetGroup = body.targetGroup;
    if (targetGroup) {
      targetGroup = { ...targetGroup };
      if (targetGroup.condition) {
        targetGroup.condition = escapeRegex(targetGroup.condition);
      }
      if (targetGroup.type === 'custom') {
        if (!targetGroup.patientIds || targetGroup.patientIds.length === 0) {
          return NextResponse.json(
            { success: false, error: 'patientIds required for a custom target group' },
            { status: 400 }
          );
        }
        const owned = await Patient.find(patientTenantFilter(ctx.tenantId, { _id: { $in: targetGroup.patientIds } }))
          .select('_id')
          .lean<{ _id: unknown }[]>();
        if (owned.length === 0) {
          return NextResponse.json(
            { success: false, error: 'No patients found' },
            { status: 404 }
          );
        }
        targetGroup.patientIds = owned.map((p) => String(p._id));
      }
    }

    const result = await sendBroadcastMessage({
      message: body.message,
      subject: body.subject,
      targetGroup,
      tenantId: ctx.tenantObjectId,
      sendSMS: body.sendSMS !== false,
      sendEmail: body.sendEmail !== false,
      sendNotification: body.sendNotification !== false,
    });

    if (result.errors.length > 0) {
      console.error('Broadcast delivery errors:', result.errors);
    }

    return NextResponse.json({
      success: true,
      message: 'Broadcast message sent',
      data: {
        success: result.success,
        sent: result.sent,
        failed: result.failed,
        errors: result.errors.map((e) => ({ patientId: e.patientId, error: 'Delivery failed' })),
      },
    });
  } catch (error) {
    console.error('Error sending broadcast message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send broadcast message' },
      { status: 500 }
    );
  }
}
