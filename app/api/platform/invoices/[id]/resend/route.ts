import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import PlatformInvoice from '@/models/PlatformInvoice';
import { requirePlatformApi, isPlatformError } from '@/lib/platform-auth';
import { emailInvoice } from '@/lib/platform-invoice';
import { createAuditLog } from '@/lib/audit';

export const maxDuration = 30;

/** POST /api/platform/invoices/[id]/resend: email an issued invoice to the clinic again. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
  await connectDB();
  const invoice = await PlatformInvoice.findById(id);
  if (!invoice || invoice.status !== 'issued') return NextResponse.json({ success: false, error: 'Only issued invoices can be sent.' }, { status: 409 });
  if (!invoice.buyer?.email) return NextResponse.json({ success: false, error: 'The clinic has no billing email.' }, { status: 409 });
  const sent = await emailInvoice(invoice);
  if (!sent) return NextResponse.json({ success: false, error: 'The email could not be sent. Check SMTP.' }, { status: 502 });
  await createAuditLog({
    userEmail: admin.email,
    userRole: 'platform-admin',
    tenantId: String(invoice.tenantId),
    action: 'update',
    resource: 'invoice',
    resourceId: invoice._id,
    description: `Platform sales invoice ${invoice.serialNo} emailed again`,
    metadata: { platform: true },
  });
  return NextResponse.json({ success: true, data: { emailedTo: invoice.buyer.email } });
}
