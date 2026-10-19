import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import { requireApiKey, isApiError, apiError } from '@/lib/api-keys';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { serializeAppointment } from '@/lib/public-api';

/** GET /api/v1/appointments/:id */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiKey(request, 'appointments:read');
  if (isApiError(ctx)) return ctx;
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return apiError(404, 'not_found', 'No such appointment.');

  await connectDB();
  const a = await Appointment.findOne({ _id: id, tenantId: ctx.tenantObjectId })
    .select('appointmentCode patient doctor appointmentDate appointmentTime scheduledAt duration status modality isWalkIn queueNumber reason createdAt updatedAt')
    .lean<any>();
  if (!a) return apiError(404, 'not_found', 'No such appointment.');
  return NextResponse.json(serializeAppointment(a, await getTenantTimezone(ctx.tenantId)));
}
