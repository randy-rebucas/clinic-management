import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { isAdmin } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { resolveReportRange, isRangeError, dateKeyInTz } from '../_lib/report-range';

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  // Only admin and accountant can view income reports
  if (!isAdmin(session) && session.role !== 'accountant') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'monthly'; // daily, weekly, monthly
    const tz = await getTenantTimezone(tenantId);

    const dateRange = resolveReportRange(searchParams, tz);
    if (isRangeError(dateRange)) {
      return NextResponse.json({ success: false, error: dateRange.error }, { status: 400 });
    }

    const invoices = await Invoice.find(tenantFilter(tenantId, {
      createdAt: { $gte: dateRange.start, $lte: dateRange.end },
    }))
      .select('total totalPaid outstandingBalance discounts tax payments status items createdAt')
      .sort({ createdAt: -1 })
      .lean();

    // Calculate totals
    const totalBilled = invoices.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0);
    const totalPaid = invoices.reduce((sum: number, inv: any) => sum + (inv.totalPaid || 0), 0);
    const totalOutstanding = invoices.reduce((sum: number, inv: any) => sum + (inv.outstandingBalance || 0), 0);
    const totalDiscounts = invoices.reduce((sum: number, inv: any) => {
      const discountTotal = inv.discounts?.reduce((dSum: number, d: any) => dSum + (d.amount || 0), 0) || 0;
      return sum + discountTotal;
    }, 0);
    const totalTax = invoices.reduce((sum: number, inv: any) => sum + (inv.tax || 0), 0);

    // Group by payment method
    const byPaymentMethod: Record<string, number> = {};
    invoices.forEach((inv: any) => {
      inv.payments?.forEach((payment: any) => {
        const method = payment.method || 'unknown';
        byPaymentMethod[method] = (byPaymentMethod[method] || 0) + (payment.amount || 0);
      });
    });

    // Group by status
    const byStatus = invoices.reduce((acc: any, inv: any) => {
      const status = inv.status || 'unpaid';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    // Group by service category
    const byCategory: Record<string, number> = {};
    invoices.forEach((inv: any) => {
      inv.items?.forEach((item: any) => {
        const category = item.category || 'other';
        byCategory[category] = (byCategory[category] || 0) + (item.total || 0);
      });
    });

    // Daily breakdown
    const byDate: Record<string, any[]> = {};
    invoices.forEach((inv: any) => {
      const dateKey = dateKeyInTz(inv.createdAt, tz);
      if (!byDate[dateKey]) {
        byDate[dateKey] = [];
      }
      byDate[dateKey].push(inv);
    });

    const dailyBreakdown = Object.entries(byDate).map(([date, dateInvoices]) => ({
      date,
      billed: dateInvoices.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0),
      paid: dateInvoices.reduce((sum: number, inv: any) => sum + (inv.totalPaid || 0), 0),
      outstanding: dateInvoices.reduce((sum: number, inv: any) => sum + (inv.outstandingBalance || 0), 0),
      count: dateInvoices.length,
    })).sort((a, b) => a.date.localeCompare(b.date));

    // Calculate averages
    const daysDiff = Math.max(1, Math.round((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24)));
    const avgDailyRevenue = daysDiff > 0 ? totalPaid / daysDiff : 0;

    return NextResponse.json({
      success: true,
      data: {
        period,
        dateRange: {
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString(),
        },
        summary: {
          totalBilled,
          totalPaid,
          totalOutstanding,
          totalDiscounts,
          totalTax,
          invoiceCount: invoices.length,
          paidInvoiceCount: invoices.filter((inv: any) => inv.status === 'paid').length,
          avgDailyRevenue: parseFloat(avgDailyRevenue.toFixed(2)),
        },
        breakdowns: {
          byPaymentMethod,
          byStatus,
          byCategory,
        },
        dailyBreakdown,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error generating income report:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate income report' },
      { status: 500 }
    );
  }
}

