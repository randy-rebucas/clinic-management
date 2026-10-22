import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import PlatformInvoice from '@/models/PlatformInvoice';
import { requirePlatformApi, isPlatformError } from '@/lib/platform-auth';
import { documentResponse, pdfFilename } from '@/lib/pdf';
import { renderPlatformInvoice } from '@/lib/platform-invoice';

export const maxDuration = 30;

/** GET /api/platform/invoices/[id]: a subscription sales invoice, page or ?format=pdf (platform admins). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
  await connectDB();
  const invoice = await PlatformInvoice.findById(id).lean();
  if (!invoice?.serialNo) return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
  return documentResponse(request, renderPlatformInvoice(invoice), pdfFilename('Sales-Invoice', invoice.serialNo));
}
