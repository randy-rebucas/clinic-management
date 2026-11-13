import { NextResponse } from 'next/server';
import { repAiConfigured } from '@/lib/rep-ai';
import { requireRepSession, isRepSessionError } from '../_lib/rep-session';
import { loadAllowance } from '../_lib/rep-ai-route';

/**
 * GET /api/medical-representatives/ai
 * Whether the AI assistant is on, and the rep's allowance this month: plan, limit, used,
 * remaining, resetsOn, and what Pro costs and gives.
 */
export async function GET() {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const allowance = await loadAllowance(rep);
    if (allowance instanceof NextResponse) return allowance;
    return NextResponse.json({ success: true, data: { available: repAiConfigured(), ...allowance } });
  } catch (error) {
    console.error('Get rep AI status error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
