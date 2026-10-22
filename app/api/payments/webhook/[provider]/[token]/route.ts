import { NextRequest, NextResponse } from 'next/server';
import PaymentAccount from '@/models/PaymentAccount';
import { adapterFor } from '@/lib/payments/registry';
import { loadCredentials } from '@/lib/payments/accounts';
import { accountForWebhook, applyAccountEvent } from '@/lib/payments/invoice-pay';

/**
 * POST /api/payments/webhook/<provider>/<token>: a clinic's or doctor's own payment account's
 * notices (the URL shown in its settings). The token picks the account; its own webhook secret
 * verifies the raw body before anything in it is read. Request bodies are never logged.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string; token: string }> }) {
  const { provider, token } = await params;
  const raw = await request.text();
  const account = await accountForWebhook(provider, token);
  const adapter = account ? adapterFor(account.provider) : null;
  const creds = account ? await loadCredentials(account) : null;
  // Same answer for an unknown account and a bad signature.
  if (!account || !adapter || !creds) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

  const event = adapter.verifyEvent(creds, raw, request.headers);
  if (!event) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

  try {
    await PaymentAccount.updateOne({ _id: account._id }, { $set: { lastWebhookAt: new Date() } });
    const r = await applyAccountEvent(account, event);
    if (!r.ok) {
      console.error(`Payment account ${account._id}: notice not applied: ${r.error}`);
      if (r.retry) return NextResponse.json({ error: 'Retry later' }, { status: 503 });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`Payment account ${account._id}: webhook failed`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Retry later' }, { status: 503 });
  }
}
