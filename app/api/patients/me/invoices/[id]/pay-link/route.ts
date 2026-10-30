import { NextRequest, NextResponse } from 'next/server';
import Invoice from '@/models/Invoice';
import logger from '@/lib/logger';
import { createAuditLog } from '@/lib/audit';
import { getSettings } from '@/lib/settings';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { invoicePayOptions } from '@/lib/payments/accounts';
import { makePayLink, payLinkOrigin, payOnlineOffer, PAY_ONLINE_ERRORS, type PayOnlineOffer } from '@/lib/payments/pay-link';
import { ownedRecordContext, isOwnedRecordError, recordNotFound, type OwnedRecordContext } from '../../../_lib/owned-record';

/**
 * The patient's invoice and whether the app can offer to pay it (its clinic's payment accounts,
 * its currency, the gateways' minimum). Settled invoices skip the account lookup.
 */
async function loadOffer(
  request: NextRequest,
  id: string
): Promise<NextResponse | { ctx: OwnedRecordContext; invoice: any; offer: PayOnlineOffer }> {
  const ctx = await ownedRecordContext(request, id, 'Invoice');
  if (isOwnedRecordError(ctx)) return ctx;

  const invoice = await Invoice.findOne(ctx.filter)
    .select('tenantId patient invoiceNumber status total outstandingBalance professionalFeeDoctor paymentClaims.status payLinks.createdAt')
    .lean<any>();
  if (!invoice) return recordNotFound('Invoice');

  const settled = payOnlineOffer(invoice, { currency: 'PHP', providers: [] });
  if (settled.code === 'REFUNDED' || settled.code === 'NOTHING_OWED') return { ctx, invoice, offer: settled };

  const tenantId = String(invoice.tenantId);
  const [settings, { accounts }] = await Promise.all([getSettings(tenantId), invoicePayOptions(tenantId, invoice)]);
  const offer = payOnlineOffer(invoice, {
    currency: settings.billingSettings?.currency || 'PHP',
    providers: accounts.map((a) => a.provider),
  });
  return { ctx, invoice, offer };
}

/**
 * GET /api/patients/me/invoices/[id]/pay-link
 * Whether this invoice can be paid from the app, for the invoice screen's "Pay online" button.
 * → 200 { offered, code, amount, minimum, methods, pendingClaim, recentCheckoutAt }
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const loaded = await loadOffer(request, id);
    if (loaded instanceof NextResponse) return loaded;
    return NextResponse.json({ success: true, data: loaded.offer });
  } catch (error) {
    logger.error('Error checking patient invoice pay options', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to check payment options' }, { status: 500 });
  }
}

/**
 * POST /api/patients/me/invoices/[id]/pay-link
 * A link to the clinic's pay page for what is owed on the patient's own (or a managed family
 * member's) invoice, the same signed link staff send (lib/payments/pay-link.ts). The app opens it
 * in an in-app browser; the payment itself lands through the provider's webhook or staff's
 * confirmation of a QR / bank-transfer claim.
 * → 200 { url, amount, expiresAt }
 *
 * Errors (`code`, all 409): REFUNDED, NOTHING_OWED, UNSUPPORTED_CURRENCY, NO_PAYMENT_OPTION, BELOW_MINIMUM.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const loaded = await loadOffer(request, id);
    if (loaded instanceof NextResponse) return loaded;
    const { ctx, invoice, offer } = loaded;
    const { session } = ctx;

    const limited = await applyRateLimit(request, rateLimiters.api, `patient-paylink:${session.guardianId ?? session.patientId}`);
    if (limited) return limited;

    if (!offer.offered && offer.code) {
      return NextResponse.json({ success: false, code: offer.code, error: PAY_ONLINE_ERRORS[offer.code] }, { status: 409 });
    }

    const tenantId = String(invoice.tenantId);
    const { url, expiresAt } = makePayLink(payLinkOrigin(), tenantId, String(invoice._id));
    await createAuditLog({
      userId: session.guardianId ?? session.patientId,
      userEmail: session.email,
      userRole: 'patient',
      tenantId,
      action: 'create',
      resource: 'invoice',
      resourceId: String(invoice._id),
      dataSubject: invoice.patient,
      description: `Patient opened a payment link from the app${session.guardianId ? ' (for a family member)' : ''} for ${offer.amount.toFixed(2)} on ${invoice.invoiceNumber}`,
      metadata: { channel: 'app', methods: offer.methods },
    });
    return NextResponse.json({ success: true, data: { url, amount: offer.amount, expiresAt } });
  } catch (error) {
    logger.error('Error creating patient payment link', error as Error);
    return NextResponse.json({ success: false, error: 'The payment page couldn’t be opened. Try again in a few minutes.' }, { status: 500 });
  }
}
