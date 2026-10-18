import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Tenant from '@/models/Tenant';
import Visit from '@/models/Visit';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { scopedTenantIds } from '../_lib/patient-scope';
import { linkedRecords, recordAtClinic } from '../_lib/linked-records';

/**
 * GET /api/patients/me/clinics
 * The clinics the signed-in patient is registered at: their own record's clinics plus those of
 * records linked to it by phone sign-in. Narrowed to the session's clinic when it carries one.
 * Each clinic: { tenantId, name, subdomain, logo, address, phone, patientCode, lastVisitAt }.
 * `tenantId` is what the list routes take as their `tenantId` filter.
 */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 });
  }

  try {
    await connectDB();

    const patient = await Patient.findById(session.patientId).select('active email tenantIds accountId').lean();
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    }
    if ((patient as any).active === false) {
      await recordPatientRefused(patient as any, request, 'access');
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    const linked = await linkedRecords(patient as any);
    const scope = (scopedTenantIds(linked.tenantIds, session) ?? []).map((id) => new Types.ObjectId(String(id)));
    if (!scope.length) return NextResponse.json({ success: true, data: [] });

    const [tenants, lastVisits, codes] = await Promise.all([
      Tenant.find({ _id: { $in: scope }, status: { $ne: 'inactive' } })
        .select('name displayName subdomain address phone settings.logo')
        .lean<Record<string, any>[]>(),
      Visit.aggregate<{ _id: Types.ObjectId; lastVisitAt: Date }>([
        { $match: { patient: { $in: linked.patientIds }, tenantId: { $in: scope } } },
        { $group: { _id: '$tenantId', lastVisitAt: { $max: '$date' } } },
      ]),
      Patient.find({ _id: { $in: linked.patientIds } }).select('patientCode').lean<{ _id: Types.ObjectId; patientCode?: string }[]>(),
    ]);

    const lastVisitBy = new Map(lastVisits.map((v) => [String(v._id), v.lastVisitAt]));
    const codeBy = new Map(codes.map((p) => [String(p._id), p.patientCode ?? null]));

    const data = tenants
      .map((t) => {
        const recordId = recordAtClinic(linked, t._id);
        return {
          tenantId: String(t._id),
          name: t.displayName || t.name,
          subdomain: t.subdomain ?? null,
          logo: t.settings?.logo ?? null,
          address: t.address ?? null,
          phone: t.phone ?? null,
          patientCode: recordId ? codeBy.get(String(recordId)) ?? null : null,
          lastVisitAt: lastVisitBy.get(String(t._id)) ?? null,
        };
      })
      // Most recently visited first; never-visited clinics last, by name.
      .sort((a, b) => {
        const at = a.lastVisitAt ? new Date(a.lastVisitAt).getTime() : 0;
        const bt = b.lastVisitAt ? new Date(b.lastVisitAt).getTime() : 0;
        return bt - at || a.name.localeCompare(b.name);
      });

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    logger.error('Error fetching patient clinics', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to fetch clinics' }, { status: 500 });
  }
}
