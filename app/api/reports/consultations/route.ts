import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
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
    const period = searchParams.get('period') || 'monthly'; // daily, weekly, monthly
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Calculate date range based on period
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
          weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
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

    // Get consultations (visits) in date range
    const visits = await Visit.find({
      date: { $gte: dateRange.start, $lte: dateRange.end },
      status: { $ne: 'cancelled' },
    })
      .populate('patient', 'firstName lastName patientCode')
      .populate('provider', 'name')
      .sort({ date: -1 });

    // Group by date
    const byDate: Record<string, any[]> = {};
    visits.forEach((visit: any) => {
      const dateKey = new Date(visit.date).toISOString().split('T')[0];
      if (!byDate[dateKey]) {
        byDate[dateKey] = [];
      }
      byDate[dateKey].push(visit);
    });

    // Calculate statistics
    const totalConsultations = visits.length;
    const byType = visits.reduce((acc: any, visit: any) => {
      const type = visit.visitType || 'consultation';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    const byStatus = visits.reduce((acc: any, visit: any) => {
      const status = visit.status || 'open';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    // Group by provider
    const byProvider: Record<string, number> = {};
    visits.forEach((visit: any) => {
      const providerName = visit.provider?.name || 'Unknown';
      byProvider[providerName] = (byProvider[providerName] || 0) + 1;
    });

    // Daily breakdown
    const dailyBreakdown = Object.entries(byDate).map(([date, dateVisits]) => ({
      date,
      count: dateVisits.length,
      byType: dateVisits.reduce((acc: any, v: any) => {
        const type = v.visitType || 'consultation';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {}),
    })).sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      success: true,
      data: {
        period,
        dateRange: {
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString(),
        },
        summary: {
          totalConsultations,
          byType,
          byStatus,
          byProvider,
        },
        dailyBreakdown,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error generating consultations report:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate consultations report' },
      { status: 500 }
    );
  }
}

