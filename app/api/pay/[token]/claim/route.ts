import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { readPayPageToken, submitPaymentClaim } from '@/lib/payments/invoice-pay';

const Body = z
  .object({
    accountId: z.string().min(1).max(40),
    amount: z.number().positive().max(10_000_000),
    referenceNo: z.string().trim().min(4, 'Enter the reference number from your receipt').max(100),
    payerName: z.string().trim().max(150).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

/**
 * POST /api/pay/<token>/claim: the patient paid by GCash/Maya QR or bank transfer and gives the
 * reference number. Nothing is recorded as paid until clinic staff confirm it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await applyRateLimit(request, rateLimiters.publicWrite);
  if (limited) return limited;
  const { token } = await params;
  const t = readPayPageToken(token);
  if (!t) return NextResponse.json({ success: false, error: 'This payment link is invalid or has expired.' }, { status: 404 });
  // Per invoice too, whoever is sending.
  const perInvoice = await applyRateLimit(request, rateLimiters.publicWritePhone, `pay-claim:${t.invoiceId}`);
  if (perInvoice) return perInvoice;

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ success: false, error: body.error.issues[0]?.message ?? 'Check the details.' }, { status: 400 });
  const r = await submitPaymentClaim(token, body.data);
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
  return NextResponse.json({ success: true });
}
