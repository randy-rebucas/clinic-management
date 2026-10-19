import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { requireApiKey, isApiError, apiError } from '@/lib/api-keys';
import { serializePatient } from '@/lib/public-api';

/** GET /api/v1/patients/:id */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiKey(request, 'patients:read');
  if (isApiError(ctx)) return ctx;
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return apiError(404, 'not_found', 'No such patient.');

  await connectDB();
  const p = await Patient.findOne({ _id: id, tenantIds: ctx.tenantObjectId })
    .select('patientCode firstName middleName lastName suffix dateOfBirth sex email phone address active createdAt updatedAt')
    .lean<any>();
  if (!p) return apiError(404, 'not_found', 'No such patient.');
  return NextResponse.json(serializePatient(p));
}
