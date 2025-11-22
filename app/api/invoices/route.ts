import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const visitId = searchParams.get('visitId');
    const status = searchParams.get('status');

    let query: any = {};
    if (patientId) {
      query.patient = patientId;
    }
    if (visitId) {
      query.visit = visitId;
    }
    if (status) {
      query.status = status;
    }

    const invoices = await Invoice.find(query)
      .populate('patient', 'firstName lastName patientCode email phone')
      .populate('visit', 'visitCode date')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    return NextResponse.json({ success: true, data: invoices });
  } catch (error: any) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const body = await request.json();

    // Auto-generate invoice number using settings prefix
    const settings = await getSettings();
    const invoicePrefix = settings.billingSettings?.invoicePrefix || 'INV';
    
    const lastInvoice = await Invoice.findOne({ invoiceNumber: { $exists: true, $ne: null } })
      .sort({ invoiceNumber: -1 })
      .exec();

    let nextNumber = 1;
    if (lastInvoice?.invoiceNumber) {
      // Extract number from invoice number (handles any prefix)
      const match = lastInvoice.invoiceNumber.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    body.invoiceNumber = `${invoicePrefix}-${String(nextNumber).padStart(6, '0')}`;

    // Calculate totals
    const subtotal = body.items.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
    const discountTotal = body.discounts?.reduce((sum: number, disc: any) => sum + (disc.amount || 0), 0) || 0;
    const afterDiscount = subtotal - discountTotal;
    const tax = body.tax || 0;
    const total = afterDiscount + tax;

    body.subtotal = subtotal;
    body.total = total;
    body.outstandingBalance = total;
    body.totalPaid = 0;
    body.status = 'unpaid';

    // Set createdBy
    if (!body.createdBy) {
      body.createdBy = session.userId;
    }

    const invoice = await Invoice.create(body);
    await invoice.populate('patient', 'firstName lastName patientCode email phone');
    await invoice.populate('visit', 'visitCode date');
    await invoice.populate('createdBy', 'name email');

    return NextResponse.json({ success: true, data: invoice }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating invoice:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create invoice' },
      { status: 500 }
    );
  }
}

