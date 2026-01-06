import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');

    const query: any = {
      status: { $in: ['unpaid', 'partial'] },
    };

    if (patientId) {
      query.patient = patientId;
    }

    const invoices = await Invoice.find(query)
      .populate('patient', 'firstName lastName patientCode email phone')
      .populate('visit', 'visitCode date')
      .sort({ createdAt: -1 });

    const totalOutstanding = invoices.reduce(
      (sum, invoice) => sum + (invoice.outstandingBalance || 0),
      0
    );

    // Group by patient
    const byPatient = invoices.reduce((acc: any, invoice: any) => {
      const patientId = invoice.patient._id.toString();
      if (!acc[patientId]) {
        acc[patientId] = {
          patient: invoice.patient,
          totalOutstanding: 0,
          invoiceCount: 0,
          invoices: [],
        };
      }
      acc[patientId].totalOutstanding += invoice.outstandingBalance || 0;
      acc[patientId].invoiceCount += 1;
      acc[patientId].invoices.push(invoice);
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      data: {
        totalOutstanding,
        totalInvoices: invoices.length,
        invoices,
        byPatient: Object.values(byPatient),
      },
    });
  } catch (error: any) {
    console.error('Error fetching outstanding invoices:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch outstanding invoices' },
      { status: 500 }
    );
  }
}

