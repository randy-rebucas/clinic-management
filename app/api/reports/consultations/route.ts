import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { resolveReportRange, isRangeError, dateKeyInTz } from '../_lib/report-range';

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const denied = await requirePermission(session, 'reports', 'read');
  if (denied) return denied;

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'monthly'; // daily, weekly, monthly
    const tz = await getTenantTimezone(tenantId);

    const dateRange = resolveReportRange(searchParams, tz);
    if (isRangeError(dateRange)) {
      return NextResponse.json({ success: false, error: dateRange.error }, { status: 400 });
    }

    const visits = await Visit.find(tenantFilter(tenantId, {
      date: { $gte: dateRange.start, $lte: dateRange.end },
      status: { $ne: 'cancelled' },
    }))
      .select('date visitType status provider')
      .populate('provider', 'name')
      .sort({ date: -1 })
      .lean();

    // Group by date
    const byDate: Record<string, any[]> = {};
    visits.forEach((visit: any) => {
      const dateKey = dateKeyInTz(visit.date, tz);
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

