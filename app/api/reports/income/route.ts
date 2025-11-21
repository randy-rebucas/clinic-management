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

  // Only admin and accountant can view income reports
  if (session.role !== 'admin' && session.role !== 'accountant') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'monthly'; // daily, weekly, monthly
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Calculate date range
    let dateRange: { start: Date; end: Date };
    const now = new Date();

    if (startDate && endDate) {
      dateRange = {
        start: new Date(startDate),
        end: new Date(endDate),
      };
      dateRange.end.setHours(23, 59, 59, 999);
    } else {
      switch (period) {
        case 'daily':
          dateRange = {
            start: new Date(now.setHours(0, 0, 0, 0)),
            end: new Date(now.setHours(23, 59, 59, 999)),
          };
          break;
        case 'weekly':
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - now.getDay());
          weekStart.setHours(0, 0, 0, 0);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          weekEnd.setHours(23, 59, 59, 999);
          dateRange = { start: weekStart, end: weekEnd };
          break;
        case 'monthly':
        default:
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          monthStart.setHours(0, 0, 0, 0);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          monthEnd.setHours(23, 59, 59, 999);
          dateRange = { start: monthStart, end: monthEnd };
          break;
      }
    }

    // Get invoices in date range
    const invoices = await Invoice.find({
      createdAt: { $gte: dateRange.start, $lte: dateRange.end },
    })
      .populate('patient', 'firstName lastName patientCode')
      .populate('visit', 'visitCode date')
      .sort({ createdAt: -1 });

    // Calculate totals
    const totalBilled = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + (inv.totalPaid || 0), 0);
    const totalOutstanding = invoices.reduce((sum, inv) => sum + (inv.outstandingBalance || 0), 0);
    const totalDiscounts = invoices.reduce((sum, inv) => {
      const discountTotal = inv.discounts?.reduce((dSum, d) => dSum + (d.amount || 0), 0) || 0;
      return sum + discountTotal;
    }, 0);
    const totalTax = invoices.reduce((sum, inv) => sum + (inv.tax || 0), 0);

    // Group by payment method
    const byPaymentMethod: Record<string, number> = {};
    invoices.forEach((inv) => {
      inv.payments?.forEach((payment) => {
        const method = payment.method || 'unknown';
        byPaymentMethod[method] = (byPaymentMethod[method] || 0) + (payment.amount || 0);
      });
    });

    // Group by status
    const byStatus = invoices.reduce((acc: any, inv) => {
      const status = inv.status || 'unpaid';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    // Group by service category
    const byCategory: Record<string, number> = {};
    invoices.forEach((inv) => {
      inv.items?.forEach((item: any) => {
        const category = item.category || 'other';
        byCategory[category] = (byCategory[category] || 0) + (item.total || 0);
      });
    });

    // Daily breakdown
    const byDate: Record<string, any[]> = {};
    invoices.forEach((inv: any) => {
      const dateKey = new Date(inv.createdAt).toISOString().split('T')[0];
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
    const daysDiff = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
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
          paidInvoiceCount: invoices.filter(inv => inv.status === 'paid').length,
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

