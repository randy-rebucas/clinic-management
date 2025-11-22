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

  // Only admin and accountant can view HMO reports
  if (session.role !== 'admin' && session.role !== 'accountant') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const provider = searchParams.get('provider');
    const status = searchParams.get('status');

    // Get invoices with insurance/HMO
    let query: any = {
      insurance: { $exists: true, $ne: null },
    };

    if (provider) {
      query['insurance.provider'] = { $regex: provider, $options: 'i' };
    }

    if (status) {
      query['insurance.status'] = status;
    }

    const invoices = await Invoice.find(query)
      .populate('patient', 'firstName lastName patientCode')
      .populate('visit', 'visitCode date')
      .sort({ createdAt: -1 });

    // Group by provider
    const byProvider: Record<string, any> = {};
    invoices.forEach((inv: any) => {
      const providerName = inv.insurance?.provider || 'Unknown';
      if (!byProvider[providerName]) {
        byProvider[providerName] = {
          provider: providerName,
          totalClaims: 0,
          totalAmount: 0,
          byStatus: {},
          claims: [],
        };
      }
      byProvider[providerName].totalClaims += 1;
      byProvider[providerName].totalAmount += inv.insurance?.coverageAmount || inv.total || 0;
      const claimStatus = inv.insurance?.status || 'pending';
      byProvider[providerName].byStatus[claimStatus] = (byProvider[providerName].byStatus[claimStatus] || 0) + 1;
      byProvider[providerName].claims.push({
        invoiceNumber: inv.invoiceNumber,
        claimNumber: inv.insurance?.claimNumber,
        amount: inv.insurance?.coverageAmount || inv.total,
        status: claimStatus,
        createdAt: inv.createdAt,
        patient: inv.patient,
      });
    });

    // Group by status
    const byStatus = invoices.reduce((acc: any, inv: any) => {
      const status = inv.insurance?.status || 'pending';
      if (!acc[status]) {
        acc[status] = {
          count: 0,
          totalAmount: 0,
          claims: [],
        };
      }
      acc[status].count += 1;
      acc[status].totalAmount += inv.insurance?.coverageAmount || inv.total || 0;
      acc[status].claims.push({
        invoiceNumber: inv.invoiceNumber,
        claimNumber: inv.insurance?.claimNumber,
        provider: inv.insurance?.provider,
        amount: inv.insurance?.coverageAmount || inv.total,
        createdAt: inv.createdAt,
        patient: inv.patient,
      });
      return acc;
    }, {});

    // Calculate totals
    const totalClaims = invoices.length;
    const totalClaimAmount = invoices.reduce((sum: number, inv: any) => sum + (inv.insurance?.coverageAmount || inv.total || 0), 0);
    const pendingClaims = invoices.filter(inv => inv.insurance?.status === 'pending').length;
    const approvedClaims = invoices.filter(inv => inv.insurance?.status === 'approved').length;
    const rejectedClaims = invoices.filter(inv => inv.insurance?.status === 'rejected').length;
    const paidClaims = invoices.filter(inv => inv.insurance?.status === 'paid').length;

    // Calculate backlog (pending + approved but not paid)
    const backlogCount = invoices.filter(
      inv => inv.insurance?.status === 'pending' || inv.insurance?.status === 'approved'
    ).length;
    const backlogAmount = invoices
      .filter(inv => inv.insurance?.status === 'pending' || inv.insurance?.status === 'approved')
      .reduce((sum: number, inv: any) => sum + (inv.insurance?.coverageAmount || inv.total || 0), 0);

    // Age of claims (days since creation)
    const claimsWithAge = invoices.map((inv: any) => {
      const daysSinceCreation = Math.floor(
        (new Date().getTime() - new Date(inv.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        invoiceNumber: inv.invoiceNumber,
        claimNumber: inv.insurance?.claimNumber,
        provider: inv.insurance?.provider,
        status: inv.insurance?.status,
        amount: inv.insurance?.coverageAmount || inv.total,
        daysSinceCreation,
        createdAt: inv.createdAt,
      };
    });

    const avgDaysPending = claimsWithAge
      .filter((c: any) => c.status === 'pending')
      .reduce((sum: number, c: any) => sum + c.daysSinceCreation, 0) / (pendingClaims || 1);

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalClaims,
          totalClaimAmount,
          pendingClaims,
          approvedClaims,
          rejectedClaims,
          paidClaims,
          backlogCount,
          backlogAmount,
          avgDaysPending: parseFloat(avgDaysPending.toFixed(2)),
        },
        byProvider: Object.values(byProvider),
        byStatus,
        claimsWithAge: claimsWithAge.sort((a, b) => b.daysSinceCreation - a.daysSinceCreation),
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error generating HMO claims report:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate HMO claims report' },
      { status: 500 }
    );
  }
}

