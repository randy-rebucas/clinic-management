import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function GET(
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

    // Get all unpaid and partially paid invoices for this patient
    const invoices = await Invoice.find({
      patient: id,
      status: { $in: ['unpaid', 'partial'] },
    })
      .populate('visit', 'visitCode date')
      .sort({ createdAt: -1 });

    const totalOutstanding = invoices.reduce(
      (sum, invoice) => sum + (invoice.outstandingBalance || 0),
      0
    );

    return NextResponse.json({
      success: true,
      data: {
        totalOutstanding,
        invoiceCount: invoices.length,
        invoices: invoices.map((inv) => ({
          _id: inv._id,
          invoiceNumber: inv.invoiceNumber,
          total: inv.total,
          outstandingBalance: inv.outstandingBalance,
          status: inv.status,
          createdAt: inv.createdAt,
          visit: inv.visit,
        })),
      },
    });
  } catch (error: any) {
    console.error('Error fetching outstanding balance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch outstanding balance' },
      { status: 500 }
    );
  }
}

