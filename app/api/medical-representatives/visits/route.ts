import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import { Types } from 'mongoose';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { getClinicForReps, repMayBook, slotRemaining, notifyClinicOfVisit } from '@/lib/rep-visits';
import { repBookingAccess } from '@/lib/rep-billing';
import { REP_VISIT_STATUSES, PERSONAL_VISIT_STATUSES, ACTIVE_CLINIC_STATUSES, parseVisitDay } from '@/lib/rep-visit-rules';
import { requireRepSession, isRepSessionError } from '../_lib/rep-session';
import {
  loadRepProfileForVisits,
  resolveVisitProducts,
  repDisplayName,
  visitError,
  type RepProfileForVisits,
  resolveLinkedClinic,
} from '../_lib/rep-visit-input';

/**
 * GET /api/medical-representatives/visits
 * The rep's visits, newest first.
 * Query params: page (default 1), limit (default 50, max 100),
 *   status? (requested | scheduled | declined | completed | cancelled | no-show),
 *   clinicId? (visits booked with that clinic), from? / to? (ISO dates, inclusive)
 */
export async function GET(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50));

    const query: Record<string, unknown> = { ...rep.ownerFilter };
    const status = searchParams.get('status');
    if (status) {
      if (!(REP_VISIT_STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json({ success: false, error: 'Invalid status value.' }, { status: 400 });
      }
      query.status = status;
    }
    const clinicId = searchParams.get('clinicId');
    if (clinicId) {
      if (!isValidId(clinicId)) return NextResponse.json({ success: false, error: 'Invalid clinicId.' }, { status: 400 });
      query.clinicId = new Types.ObjectId(clinicId);
    }
    const dateRange: Record<string, Date> = {};
    for (const [param, op] of [['from', '$gte'], ['to', '$lte']] as const) {
      const value = searchParams.get(param);
      if (!value) continue;
      const parsed = new Date(value);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ success: false, error: `Invalid ${param} date.` }, { status: 400 });
      }
      dateRange[op] = parsed;
    }
    if (Object.keys(dateRange).length) query.date = dateRange;

    await connectDB();

    const [visits, total] = await Promise.all([
      MedicalRepresentativeVisit.find(query)
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      MedicalRepresentativeVisit.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: visits,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    console.error('Get visits error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/medical-representatives/visits
 * Log a visit, or, with `clinicId`, ask a clinic on MyClinicSoft for one. A clinic request takes
 * `date: "YYYY-MM-DD"` and a `time` from the clinic's slots, starts as `requested`, and the
 * clinic's name, location and slot length are filled in from the clinic.
 */
export async function POST(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const clinicId = typeof body.clinicId === 'string' ? body.clinicId.trim() : '';
    let clinicName = typeof body.clinicName === 'string' ? body.clinicName.trim() : '';
    let clinicLocation = typeof body.clinicLocation === 'string' ? body.clinicLocation.trim() : '';
    const purpose = typeof body.purpose === 'string' ? body.purpose.trim() : '';
    const date = typeof body.date === 'string' ? body.date.trim() : '';
    const time = typeof body.time === 'string' ? body.time.trim() : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    let status = typeof body.status === 'string' ? body.status.trim() : 'scheduled';
    const durationRaw = typeof body.duration === 'number' ? body.duration : Number(body.duration);
    let duration = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.min(Math.floor(durationRaw), 24 * 60) : 60;

    if (clinicId && !isValidId(clinicId)) return notFound('Clinic');

    const linkedRaw = clinicId ? undefined : body.linkedClinicId;
    if ((!clinicId && !linkedRaw && (!clinicName || !clinicLocation)) || !purpose || !date || !time) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (clinicName.length > 200 || clinicLocation.length > 300 || purpose.length > 500 || notes.length > 2000) {
      return NextResponse.json({ success: false, error: 'One or more fields exceed maximum length.' }, { status: 400 });
    }

    if (!/^\d{2}:\d{2}$/.test(time)) {
      return NextResponse.json({ success: false, error: 'Time must be in HH:mm format.' }, { status: 400 });
    }

    await connectDB();

    const productIds = await resolveVisitProducts(rep, body.productIds);
    if (productIds instanceof NextResponse) return productIds;

    let parsedDate: Date | null;
    const linked: Record<string, unknown> = {};
    let profile: RepProfileForVisits | null = null;

    if (clinicId) {
      parsedDate = parseVisitDay(date);
      if (!parsedDate) return visitError(400, 'date must be YYYY-MM-DD for a clinic visit.');

      profile = await loadRepProfileForVisits(rep);
      const clinic = await getClinicForReps(clinicId);
      if (!profile || !clinic || !repMayBook(clinic, profile.tenantIds).allowed) return notFound('Clinic');

      const access = await repBookingAccess(profile);
      if (!access.ok) {
        return visitError(402, 'Booking visits with clinics needs an active rep subscription.', 'SUBSCRIPTION_REQUIRED');
      }

      const remaining = await slotRemaining(clinic, date, parsedDate, time);
      if (remaining === null) return visitError(400, 'The clinic does not take rep visits at that time.', 'SLOT_UNAVAILABLE');
      if (remaining <= 0) return visitError(409, 'That slot is full. Pick another time.', 'SLOT_FULL');

      const duplicate = await MedicalRepresentativeVisit.exists({
        ...rep.ownerFilter,
        clinicId: new Types.ObjectId(clinic.id),
        date: parsedDate,
        status: { $in: ACTIVE_CLINIC_STATUSES },
      });
      if (duplicate) return visitError(409, 'You already have a visit with this clinic that day.', 'DUPLICATE_REQUEST');

      clinicName = clinic.name;
      clinicLocation = clinic.location;
      duration = clinic.settings.slotMinutes;
      status = 'requested';
      Object.assign(linked, { clinicId: new Types.ObjectId(clinic.id), medicalRepresentativeId: profile._id });
    } else {
      if (!(PERSONAL_VISIT_STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json({ success: false, error: 'Invalid status value.' }, { status: 400 });
      }
      parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json({ success: false, error: 'Invalid date.' }, { status: 400 });
      }
      // Linked to a clinic on MyClinicSoft: still the rep's own entry, named as the clinic is.
      const linkedClinic = await resolveLinkedClinic(rep, linkedRaw);
      if (linkedClinic instanceof NextResponse) return linkedClinic;
      if (linkedClinic) {
        linked.linkedClinicId = linkedClinic.id;
        clinicName = linkedClinic.name;
        clinicLocation = linkedClinic.location;
      }
    }

    const visit = await MedicalRepresentativeVisit.create({
      ...rep.ownerFilter,
      ...linked,
      clinicName,
      clinicLocation,
      purpose,
      date: parsedDate,
      time,
      duration,
      status,
      notes,
      ...(productIds ? { productIds } : {}),
    });

    if (profile) {
      await notifyClinicOfVisit(visit, 'requested', { name: repDisplayName(profile), company: profile.company });
    }

    return NextResponse.json({
      success: true,
      message: clinicId ? 'Visit requested. The clinic will confirm it.' : 'Visit created successfully',
      data: visit,
    });
  } catch (error: any) {
    console.error('Create visit error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
