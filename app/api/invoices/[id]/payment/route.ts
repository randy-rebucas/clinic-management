import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { recordPayment } from '@/lib/data/invoice';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const tenantId = session.tenantId || null;

    // Payment atomicity: recordPayment() reads the invoice's existing
    // payments, computes the new totalPaid/outstandingBalance/status, and
    // writes the new InvoicePayment row + those aggregate scalars in one
    // prisma.invoice.update() call (lib/data/invoice.ts).
    const invoice = await run(tenantId, () =>
      recordPayment(id, {
        method: body.method || 'cash',
        amount: body.amount,
        date: body.date ? new Date(body.date) : new Date(),
        receiptNo: body.receiptNo,
        referenceNo: body.referenceNo,
        processedById: session.userId,
        notes: body.notes,
      })
    );

    // NOTE: payment-received notifications are OUT OF SCOPE for this batch
    // (Notification model — later batch). The Mongoose-era route did not
    // send one either, so no behavior is lost here.

    return NextResponse.json({ success: true, data: invoice });
  } catch (error: any) {
    console.error('Error recording payment:', error);
    if (error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to record payment' },
      { status: 500 }
    );
  }
}
