import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Add payment
    const payment = {
      method: body.method || 'cash',
      amount: body.amount,
      date: body.date ? new Date(body.date) : new Date(),
      receiptNo: body.receiptNo,
      referenceNo: body.referenceNo,
      processedBy: session.userId,
      notes: body.notes,
    };

    if (!invoice.payments) {
      invoice.payments = [];
    }
    invoice.payments.push(payment);

    // Calculate totals
    const totalPaid = invoice.payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
    const total = invoice.total || 0;
    const outstandingBalance = total - totalPaid;

    invoice.totalPaid = totalPaid;
    invoice.outstandingBalance = outstandingBalance;

    // Update status
    if (outstandingBalance <= 0) {
      invoice.status = 'paid';
    } else if (totalPaid > 0) {
      invoice.status = 'partial';
    } else {
      invoice.status = 'unpaid';
    }

    await invoice.save();
    await invoice.populate('patient', 'firstName lastName patientCode email phone');
    await invoice.populate('visit', 'visitCode date');
    await invoice.populate('createdBy', 'name email');

    return NextResponse.json({ success: true, data: invoice });
  } catch (error: any) {
    console.error('Error recording payment:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to record payment' },
      { status: 500 }
    );
  }
}

