import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { requireApiKey, isApiError, apiError, pageParams, pageOf, parseApiBody } from '@/lib/api-keys';
import { escapeRegex } from '@/lib/api/validate';
import { nextPatientCode } from '@/lib/patient-schema';
import { serializePatient } from '@/lib/public-api';

const PUBLIC_FIELDS = 'patientCode firstName middleName lastName suffix dateOfBirth sex email phone address active createdAt updatedAt';

/**
 * GET /api/v1/patients — the clinic's patients, newest first.
 * Query: limit (1–100), cursor, q (name, code, phone or email), updated_since (ISO date).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireApiKey(request, 'patients:read');
  if (isApiError(ctx)) return ctx;
  const page = pageParams(request);
  if (page instanceof NextResponse) return page;

  const sp = request.nextUrl.searchParams;
  const filter: Record<string, unknown> = { tenantIds: ctx.tenantObjectId };
  if (page.after) filter._id = { $lt: page.after };
  const q = sp.get('q')?.trim().slice(0, 100);
  if (q) {
    const re = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ firstName: re }, { lastName: re }, { patientCode: re }, { phone: re }, { email: re }];
  }
  const since = sp.get('updated_since');
  if (since) {
    const d = new Date(since);
    if (Number.isNaN(d.getTime())) return apiError(400, 'invalid_parameter', 'updated_since must be an ISO 8601 date.');
    filter.updatedAt = { $gte: d };
  }

  await connectDB();
  const rows = await Patient.find(filter).select(PUBLIC_FIELDS).sort({ _id: -1 }).limit(page.limit + 1).lean<any[]>();
  return NextResponse.json(pageOf(rows.map(serializePatient), page.limit));
}

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const text = (max: number) => z.string().trim().min(1).max(max);

const CreateSchema = z.object({
  first_name: text(100),
  middle_name: z.string().trim().max(100).optional(),
  last_name: text(100),
  suffix: z.string().trim().max(20).optional(),
  date_of_birth: ymd,
  sex: z.enum(['male', 'female', 'other']),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  address: z.object({
    street: text(200),
    city: text(200),
    state: text(200),
    zip_code: text(20),
  }),
});

/**
 * POST /api/v1/patients — register a patient. No welcome message is sent (imports would
 * otherwise text every patient); the clinic's plan limits apply.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireApiKey(request, 'patients:write');
  if (isApiError(ctx)) return ctx;
  const parsed = await parseApiBody(request, CreateSchema);
  if (parsed instanceof NextResponse) return parsed;
  const b = parsed.data;

  await connectDB();
  const { checkSubscriptionLimit } = await import('@/lib/subscription-limits');
  const limit = await checkSubscriptionLimit(ctx.tenantId, 'createPatient');
  if (!limit.allowed) return apiError(403, 'plan_limit', limit.reason || 'The clinic has reached its plan’s patient limit.');

  const data = {
    firstName: b.first_name,
    middleName: b.middle_name,
    lastName: b.last_name,
    suffix: b.suffix,
    dateOfBirth: new Date(`${b.date_of_birth}T00:00:00Z`),
    sex: b.sex,
    phone: b.phone,
    email: b.email,
    address: { street: b.address.street, city: b.address.city, state: b.address.state, zipCode: b.address.zip_code },
    tenantIds: [ctx.tenantObjectId],
  };
  if (Number.isNaN(data.dateOfBirth.getTime())) return apiError(400, 'validation_failed', 'date_of_birth: not a real date');

  let patient: any;
  for (let attempt = 0; attempt < 3 && !patient; attempt++) {
    try {
      patient = await Patient.create({ ...data, patientCode: await nextPatientCode() });
    } catch (error: any) {
      if (error.code === 11000 && error.keyPattern?.patientCode) continue;
      if (error.name === 'ValidationError') return apiError(400, 'validation_failed', 'The patient record is not valid.');
      throw error;
    }
  }
  if (!patient) return apiError(500, 'internal_error', 'The patient could not be created. Try again.');

  // patient.created goes out from the model's save hook (lib/webhook-events.ts)
  return NextResponse.json(serializePatient(patient.toObject()), { status: 201 });
}
