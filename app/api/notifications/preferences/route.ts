import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import NotificationPreference from '@/models/NotificationPreference';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { MAX_PAUSE_MS, TIME_OF_DAY, isValidTimezone, type QuietHours } from '@/lib/notification-policy';
import { requireNotificationScope, isNotificationScopeError } from '../_lib/scope';

const DEFAULT_QUIET_HOURS: Omit<QuietHours, 'timezone'> & { timezone: null } = {
  enabled: false,
  start: '22:00',
  end: '07:00',
  timezone: null,
};

const quietHoursSchema = z
  .object({
    enabled: z.boolean(),
    start: z.string().regex(TIME_OF_DAY, 'Use a 24-hour time'),
    end: z.string().regex(TIME_OF_DAY, 'Use a 24-hour time'),
    timezone: z.string().max(100).refine(isValidTimezone, 'Unknown timezone'),
  })
  .refine((q) => q.start !== q.end, { message: 'Quiet hours must start and end at different times', path: ['end'] });

const preferencesSchema = z
  .object({
    pausedUntil: z.iso
      .datetime()
      .refine((value) => new Date(value).getTime() <= Date.now() + MAX_PAUSE_MS, 'A pause can last 7 days at most')
      .nullable()
      .optional(),
    quietHours: quietHoursSchema.optional(),
  })
  .refine((body) => body.pausedUntil !== undefined || body.quietHours !== undefined, 'Nothing to update');

type StoredPreferences = { pausedUntil?: Date | null; quietHours?: QuietHours } | null;

const view = (row: StoredPreferences) => ({
  pausedUntil: row?.pausedUntil ? row.pausedUntil.toISOString() : null,
  quietHours: row?.quietHours ?? DEFAULT_QUIET_HOURS,
});

/** The caller's own delivery preferences. */
export async function GET() {
  const scope = await requireNotificationScope();
  if (isNotificationScopeError(scope)) return scope;

  try {
    await connectDB();
    const row = await NotificationPreference.findOne({ userId: new Types.ObjectId(scope.session.userId) })
      .select('pausedUntil quietHours')
      .lean<StoredPreferences>();
    return NextResponse.json({ success: true, data: view(row) });
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch notification preferences' }, { status: 500 });
  }
}

/** Update the pause, the quiet hours, or both. Only the fields sent change. */
export async function PUT(request: NextRequest) {
  const scope = await requireNotificationScope();
  if (isNotificationScopeError(scope)) return scope;

  const parsed = await parseBody(request, preferencesSchema);
  if (isValidationError(parsed)) return parsed;
  const { pausedUntil, quietHours } = parsed.data;

  try {
    await connectDB();
    const row = await NotificationPreference.findOneAndUpdate(
      { userId: new Types.ObjectId(scope.session.userId) },
      {
        $set: {
          ...(pausedUntil !== undefined ? { pausedUntil: pausedUntil ? new Date(pausedUntil) : null } : {}),
          ...(quietHours ? { quietHours } : {}),
        },
      },
      { upsert: true, new: true }
    ).lean<StoredPreferences>();
    return NextResponse.json({ success: true, data: view(row) });
  } catch (error) {
    console.error('Error saving notification preferences:', error);
    return NextResponse.json({ success: false, error: 'Failed to save notification preferences' }, { status: 500 });
  }
}
