import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import PlatformInvoice from '@/models/PlatformInvoice';
import { refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { documentResponse, pdfFilename } from '@/lib/pdf';
import { renderPlatformInvoice } from '@/lib/platform-invoice';

export const maxDuration = 30;

/**
 * GET /api/subscription/invoices/[id]: one of the clinic's sales invoices from DevCom Digital,
 * as a printable page, or a PDF with ?format=pdf (&download=1 to save it). Admin/owner only.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  if (!['admin', 'owner'].includes(ctx.session.role)) return refuseAccess(ctx.session, 'Forbidden', 'subscription', 'read');

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
  await connectDB();
  const invoice = await PlatformInvoice.findOne({ _id: id, tenantId: ctx.tenantObjectId, status: { $in: ['issued', 'cancelled'] } }).lean();
  if (!invoice?.serialNo) return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
  return documentResponse(request, renderPlatformInvoice(invoice), pdfFilename('Sales-Invoice', invoice.serialNo));
}
