import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import RepDelivery from '@/models/RepDelivery';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { briefRepVisit, repAiConfigured, type BriefHistory } from '@/lib/rep-ai';
import { recordAiTokens, releaseAiAction, reserveAiAction } from '@/lib/rep-ai-usage';
import { requireRepSession, isRepSessionError } from '../../_lib/rep-session';
import { allowanceUsedUp, loadAllowance, repAiErrorResponse, repAiRateLimited } from '../../_lib/rep-ai-route';

export const maxDuration = 60;

/** A saved brief is shown again for free within this time; the rep can ask for a fresh one. */
const BRIEF_FRESH_MS = 12 * 60 * 60 * 1000;
const PAST_VISITS = 12;
const DELIVERIES = 10;
const NOTES_CHARS = 600;

const Input = z.object({ visitId: zObjectId, refresh: z.boolean().optional() });

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A stored instant as its Manila day. */
const manilaDay = (d: Date) => new Date(new Date(d).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
const clip = (s: string | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n)}…` : s);

const STATUS_WORD: Record<string, string> = {
  requested: 'waiting for the clinic',
  scheduled: 'approved, not closed',
  declined: 'declined by the clinic',
  completed: 'done',
  cancelled: 'cancelled',
  'no-show': 'missed',
};

/**
 * POST /api/medical-representatives/ai/visit-brief  { visitId, refresh? }
 * A short brief for this visit from the rep's own history with the clinic. Returns the saved
 * brief when it is under 12 hours old (free) unless `refresh`; a new brief uses one AI action.
 * With no history at all there is nothing to brief: `{ brief: null, reason: 'noHistory' }`, free.
 */
export async function POST(request: NextRequest) {
  const rep = await requireRepSession();
  if (isRepSessionError(rep)) return rep;

  const parsed = await parseBody(request, Input);
  if (isValidationError(parsed)) return parsed;
  const { visitId, refresh } = parsed.data;

  let reserved = false;
  try {
    await connectDB();
    const visit = await MedicalRepresentativeVisit.findOne({ ...rep.ownerFilter, _id: visitId })
      .select('+aiBrief clinicId linkedClinicId clinicName purpose date time')
      .lean<any>();
    if (!visit) return NextResponse.json({ success: false, error: 'Visit not found' }, { status: 404 });

    const saved = visit.aiBrief;
    if (!refresh && saved?.brief && saved.generatedAt && Date.now() - new Date(saved.generatedAt).getTime() < BRIEF_FRESH_MS) {
      return NextResponse.json({ success: true, data: { brief: saved.brief, generatedAt: saved.generatedAt, cached: true } });
    }

    // The same clinic: booked with it, linked to it, or an own log entry under the same name.
    const tenant: Types.ObjectId | null = visit.clinicId ?? visit.linkedClinicId ?? null;
    const sameClinic: Record<string, unknown>[] = [{ clinicName: { $regex: `^${escapeRegex(visit.clinicName.trim())}$`, $options: 'i' } }];
    if (tenant) sameClinic.push({ clinicId: tenant }, { linkedClinicId: tenant });

    const [past, deliveries] = await Promise.all([
      MedicalRepresentativeVisit.find({ ...rep.ownerFilter, _id: { $ne: visit._id }, $or: sameClinic, date: { $lte: visit.date } })
        .select('date status purpose notes clinicNote productIds')
        .sort({ date: -1, time: -1 })
        .limit(PAST_VISITS)
        .lean<any[]>(),
      tenant
        ? RepDelivery.find({ ...rep.ownerFilter, clinicId: tenant })
            .select('createdAt kind status lines.productName lines.quantity lines.unit clinicNote')
            .sort({ createdAt: -1 })
            .limit(DELIVERIES)
            .lean<any[]>()
        : Promise.resolve([] as any[]),
    ]);
    if (!past.length && !deliveries.length) {
      return NextResponse.json({ success: true, data: { brief: null, reason: 'noHistory' } });
    }

    if (!repAiConfigured()) return NextResponse.json({ success: false, error: 'The AI assistant is not available right now.' }, { status: 503 });
    const limited = await repAiRateLimited(rep, request.headers);
    if (limited) return limited;
    const allowance = await loadAllowance(rep);
    if (allowance instanceof NextResponse) return allowance;
    if (!(await reserveAiAction(rep.userObjectId, allowance.limit, 'visitBrief'))) return allowanceUsedUp(allowance);
    reserved = true;

    const products = await Product.find({ ...rep.ownerFilter }).select('name strength status').limit(300).lean<any[]>();
    const nameOf = new Map(products.map((p) => [String(p._id), `${p.name}${p.strength ? ` ${p.strength}` : ''}`]));

    const history: BriefHistory = {
      today: manilaDay(new Date()),
      visit: { clinicName: visit.clinicName, date: new Date(visit.date).toISOString().slice(0, 10), time: visit.time, purpose: visit.purpose },
      pastVisits: past.map((v) => ({
        date: new Date(v.date).toISOString().slice(0, 10),
        status: STATUS_WORD[v.status] ?? v.status,
        purpose: v.purpose,
        notes: clip(v.notes?.trim(), NOTES_CHARS),
        clinicNote: clip(v.clinicNote?.trim(), 300),
        products: (v.productIds ?? []).map((id: unknown) => nameOf.get(String(id))).filter(Boolean),
      })),
      deliveries: deliveries.map((d) => ({
        date: manilaDay(d.createdAt),
        kind: d.kind,
        status: d.status,
        items: (d.lines ?? []).map((l: any) => `${l.productName} ×${l.quantity} ${l.unit}`).join(', '),
        clinicNote: clip(d.clinicNote?.trim(), 300),
      })),
      products: products.filter((p) => p.status === 'active').map((p) => nameOf.get(String(p._id))!).slice(0, 60),
    };

    const { brief, usage } = await briefRepVisit(history);
    const generatedAt = new Date();
    await Promise.all([
      recordAiTokens(rep.userObjectId, usage),
      MedicalRepresentativeVisit.updateOne({ _id: visit._id }, { $set: { aiBrief: { brief, generatedAt } } }),
    ]);
    return NextResponse.json({
      success: true,
      data: { brief, generatedAt, cached: false, basedOn: { visits: past.length, deliveries: deliveries.length }, remaining: Math.max(0, allowance.remaining - 1) },
    });
  } catch (error) {
    if (reserved) await releaseAiAction(rep.userObjectId, 'visitBrief');
    return repAiErrorResponse(error, 'Rep AI visit brief');
  }
}
