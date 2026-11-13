import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Settings from '@/models/Settings';
import Tenant from '@/models/Tenant';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import { notifyStaff } from '@/lib/notify';
import { notifyRep } from '@/lib/rep-notify';
import { normalizeRepVisitSettings, localNow, slotsForDay, type RepVisitSettings } from '@/lib/rep-visit-rules';

/**
 * Server side of rep visits booked with a clinic: the clinic's settings, slot capacity, who may
 * book, and the notifications each side gets. Rules shared with the UI are in rep-visit-rules.
 */

/** Visit fields a clinic never sees: the rep's private notes and our bookkeeping. */
export const CLINIC_HIDDEN_VISIT_FIELDS = '-notes -reminderSentAt -tenantId';

/** Rep fields a clinic sees on a visit (no 2 MB profile image, nothing private). */
export const VISIT_REP_FIELDS = 'firstName lastName title company territory phone email';

/** The product sheet a clinic sees for products a rep brings. */
export const VISIT_PRODUCT_FIELDS = 'name category manufacturer description dosage strength packaging expiryDate specifications';

/** Clinic roles told about rep visit requests (the /medical-reps page is admin-only). */
const CLINIC_AUDIENCE_ROLES = ['admin', 'owner'];

export interface ClinicForReps {
  id: string;
  name: string;
  location: string;
  timezone: string;
  settings: RepVisitSettings;
}

function locationOf(tenant: any, settings: any): string {
  if (settings?.clinicAddress) return String(settings.clinicAddress);
  const a = tenant?.address ?? {};
  return [a.street, a.city, a.state].filter(Boolean).join(', ');
}

/** A clinic's rep-visit settings with what the rep app shows about the clinic. Null if the clinic is not active. */
export async function getClinicForReps(tenantId: string | Types.ObjectId): Promise<ClinicForReps | null> {
  await connectDB();
  const tid = new Types.ObjectId(String(tenantId));
  const [tenant, settings] = await Promise.all([
    Tenant.findOne({ _id: tid, status: 'active' }).select('name displayName address').lean<any>(),
    Settings.findOne({ tenantId: tid }).select('clinicName clinicAddress repVisitSettings generalSettings.timezone').lean<any>(),
  ]);
  if (!tenant) return null;
  return {
    id: String(tid),
    name: tenant.displayName || tenant.name,
    location: locationOf(tenant, settings) || '—',
    timezone: settings?.generalSettings?.timezone || 'Asia/Manila',
    settings: normalizeRepVisitSettings(settings?.repVisitSettings),
  };
}

/** Approved visits per start time at a clinic on a day (the stored UTC-midnight date). */
export async function bookedSlotCounts(clinicId: string | Types.ObjectId, date: Date, excludeVisitId?: string): Promise<Record<string, number>> {
  const match: Record<string, unknown> = { clinicId: new Types.ObjectId(String(clinicId)), date, status: 'scheduled' };
  if (excludeVisitId) match._id = { $ne: new Types.ObjectId(excludeVisitId) };
  const rows = await MedicalRepresentativeVisit.aggregate<{ _id: string; n: number }>([
    { $match: match },
    { $group: { _id: '$time', n: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
}

/** Slots left at `time` on `date`, honouring the clinic's hours, horizon and the clinic's "now". */
export async function slotRemaining(clinic: ClinicForReps, day: string, date: Date, time: string, excludeVisitId?: string): Promise<number | null> {
  const slots = slotsForDay(clinic.settings, day, await bookedSlotCounts(clinic.id, date, excludeVisitId), localNow(clinic.timezone));
  const slot = slots.find((s) => s.time === time);
  return slot ? slot.remaining : null;
}

/**
 * Whether a rep may book with a clinic: the clinic takes rep visits, and either already works
 * with the rep (it added them) or is open to all reps.
 */
export function repMayBook(clinic: ClinicForReps, repTenantIds: unknown[] | undefined): { allowed: boolean; linked: boolean } {
  const linked = (repTenantIds ?? []).some((t) => String(t) === clinic.id);
  return { allowed: clinic.settings.enabled && (linked || clinic.settings.openToAllReps), linked };
}

function visitWhen(v: { date: Date; time: string }) {
  const day = v.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${day} at ${v.time}`;
}

type VisitLike = { _id: unknown; userId: unknown; clinicId?: unknown; clinicName: string; date: Date; time: string; purpose?: string };

export type ClinicEvent = 'requested' | 'rescheduled' | 'cancelled';

/** Tell the clinic's admins about a rep's request, a reschedule or a cancellation. */
export async function notifyClinicOfVisit(visit: VisitLike, event: ClinicEvent, rep: { name: string; company?: string }) {
  if (!visit.clinicId) return;
  const who = rep.company ? `${rep.name} (${rep.company})` : rep.name;
  const copy: Record<ClinicEvent, { title: string; message: string }> = {
    requested: { title: 'Rep visit request', message: `${who} asks to visit on ${visitWhen(visit)}: ${visit.purpose ?? ''}`.trim() },
    rescheduled: { title: 'Rep visit moved', message: `${who} asks to move their visit to ${visitWhen(visit)}.` },
    cancelled: { title: 'Rep visit cancelled', message: `${who} cancelled their visit on ${visitWhen(visit)}.` },
  };
  try {
    await notifyStaff({
      tenantId: String(visit.clinicId),
      audience: { roles: CLINIC_AUDIENCE_ROLES },
      type: 'visit',
      priority: event === 'cancelled' ? 'normal' : 'high',
      ...copy[event],
      actionUrl: `/medical-reps?tab=visits&visit=${String(visit._id)}`,
      sender: { kind: 'system', name: who },
      metadata: { repVisitId: String(visit._id), event },
    });
  } catch (error) {
    console.error('[rep-visits] clinic notification failed:', error);
  }
}

export type RepEvent = 'approved' | 'declined' | 'cancelled' | 'checked-in' | 'completed' | 'no-show';

/** Tell the rep the clinic's answer: stored in their inbox, pushed unless they switched push off. Never throws. */
export async function notifyRepOfVisit(visit: VisitLike, event: RepEvent, note?: string) {
  try {
    const copy: Record<RepEvent, { title: string; body: string }> = {
      approved: { title: 'Visit approved', body: `${visit.clinicName} approved your visit on ${visitWhen(visit)}.` },
      declined: { title: 'Visit declined', body: `${visit.clinicName} declined your visit on ${visitWhen(visit)}.` },
      cancelled: { title: 'Visit cancelled', body: `${visit.clinicName} cancelled your visit on ${visitWhen(visit)}.` },
      'checked-in': { title: 'Checked in', body: `You're checked in at ${visit.clinicName}.` },
      completed: { title: 'Visit completed', body: `${visit.clinicName} marked your visit complete.` },
      'no-show': { title: 'Visit missed', body: `${visit.clinicName} marked you as not arriving on ${visitWhen(visit)}.` },
    };
    const { title, body } = copy[event];
    await notifyRep(
      { userId: visit.userId },
      {
        kind: 'visit',
        title,
        body: note ? `${body} ${note}`.slice(0, 240) : body,
        screen: 'visits',
        id: String(visit._id),
        tag: `medrep-visit-${String(visit._id)}`,
      }
    );
  } catch (error) {
    console.error('[rep-visits] rep notification failed:', error);
  }
}

/** Keep the rep's visit counters (shown to clinics) in step with a clinic visit closing. */
export async function bumpRepMetrics(medicalRepresentativeId: unknown, outcome: 'completed' | 'cancelled') {
  if (!medicalRepresentativeId) return;
  await MedicalRepresentative.updateOne(
    { _id: medicalRepresentativeId },
    {
      $inc: { 'performanceMetrics.totalVisits': 1, [`performanceMetrics.${outcome}Visits`]: 1 },
      $set: { 'performanceMetrics.lastUpdated': new Date() },
    }
  );
}
