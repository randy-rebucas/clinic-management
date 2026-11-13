import 'server-only';
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { repAiAllowance, type RepAiAllowance } from '@/lib/rep-ai-usage';
import { RepAiError } from '@/lib/rep-ai';
import { consumeRateLimit, getClientIp } from '@/lib/middleware/rate-limit';
import { repProfileFilter, type RepSession } from './rep-session';

/** Bursts only; the monthly allowance is the real limit. */
const LIMIT = { name: 'rep-ai', windowMs: 60 * 60 * 1000, maxRequests: 60, identifierOnly: true, message: 'You have used the AI assistant a lot this hour. Try again later.' };

export async function repAiRateLimited(rep: RepSession, headers: Headers): Promise<NextResponse | null> {
  const limited = await consumeRateLimit(LIMIT, getClientIp(headers), rep.session.userId);
  return limited.allowed ? null : NextResponse.json({ success: false, error: LIMIT.message }, { status: 429 });
}

/** The rep's allowance this month, or a 404 when their profile is missing. */
export async function loadAllowance(rep: RepSession): Promise<RepAiAllowance | NextResponse> {
  await connectDB();
  const profile = await MedicalRepresentative.findOne(repProfileFilter(rep)).select('subscription.plan subscription.expiresAt').lean<any>();
  if (!profile) return NextResponse.json({ success: false, error: 'Medical representative not found' }, { status: 404 });
  return repAiAllowance(rep.userObjectId, profile);
}

/** The allowance is used up: say when it resets, and whether Pro would help. */
export function allowanceUsedUp(a: RepAiAllowance): NextResponse {
  const more = a.plan === 'standard' && a.proMonthly > 0;
  return NextResponse.json(
    {
      success: false,
      code: more ? 'AI_UPGRADE' : 'AI_LIMIT',
      error: more
        ? `You’ve used this month’s ${a.limit} free AI actions. Pro gives you ${a.proActions} a month.`
        : a.limit === 0
          ? 'The AI assistant is part of Pro.'
          : `You’ve used this month’s ${a.limit} AI actions. They reset on ${a.resetsOn}.`,
      data: { allowance: a },
    },
    { status: 402 }
  );
}

export function repAiErrorResponse(error: unknown, what: string): NextResponse {
  if (error instanceof RepAiError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  console.error(`${what} error:`, error);
  return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
}
