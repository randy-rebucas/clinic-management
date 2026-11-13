import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { draftRepVisitNote, repAiConfigured } from '@/lib/rep-ai';
import { MAX_VISIT_NOTE_INPUT } from '@/lib/rep-ai-schema';
import { recordAiTokens, releaseAiAction, reserveAiAction } from '@/lib/rep-ai-usage';
import { requireRepSession, isRepSessionError } from '../../_lib/rep-session';
import { allowanceUsedUp, loadAllowance, repAiErrorResponse, repAiRateLimited } from '../../_lib/rep-ai-route';

// One Claude call; a long account can take a while.
export const maxDuration = 60;

const Input = z.object({
  text: z.string().trim().min(15, 'Say or type a bit more about the visit first.').max(MAX_VISIT_NOTE_INPUT, 'That is too long. Shorten it and try again.'),
  visitId: zObjectId.optional(),
});

/**
 * POST /api/medical-representatives/ai/visit-note  { text, visitId? }
 * Drafts visit notes from the rep's dictated or typed account: notes text, matched products,
 * follow-up and words to check. Uses one AI action. Nothing is saved, and the account isn't
 * stored or logged.
 */
export async function POST(request: NextRequest) {
  const rep = await requireRepSession();
  if (isRepSessionError(rep)) return rep;
  if (!repAiConfigured()) return NextResponse.json({ success: false, error: 'The AI assistant is not available right now.' }, { status: 503 });
  const limited = await repAiRateLimited(rep, request.headers);
  if (limited) return limited;

  const parsed = await parseBody(request, Input);
  if (isValidationError(parsed)) return parsed;
  const { text, visitId } = parsed.data;

  let reserved = false;
  try {
    const allowance = await loadAllowance(rep);
    if (allowance instanceof NextResponse) return allowance;

    await connectDB();
    let clinicName: string | undefined;
    if (visitId) {
      const visit = await MedicalRepresentativeVisit.findOne({ ...rep.ownerFilter, _id: visitId }).select('clinicName').lean<{ clinicName: string } | null>();
      if (!visit) return NextResponse.json({ success: false, error: 'Visit not found' }, { status: 404 });
      clinicName = visit.clinicName;
    }

    if (!(await reserveAiAction(rep.userObjectId, allowance.limit, 'visitNote'))) return allowanceUsedUp(allowance);
    reserved = true;

    const products = await Product.find({ ...rep.ownerFilter, status: 'active' })
      .select('name strength')
      .sort({ name: 1 })
      .limit(200)
      .lean<{ _id: unknown; name: string; strength?: string }[]>();

    const { result, usage } = await draftRepVisitNote(text, {
      clinicName,
      products: products.map((p) => ({ _id: String(p._id), name: p.name, strength: p.strength })),
    });
    await recordAiTokens(rep.userObjectId, usage);
    return NextResponse.json({ success: true, data: { ...result, remaining: Math.max(0, allowance.remaining - 1) } });
  } catch (error) {
    if (reserved) await releaseAiAction(rep.userObjectId, 'visitNote');
    return repAiErrorResponse(error, 'Rep AI visit note');
  }
}
