import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { markFollowUpReminderSent, findVisitsNeedingFollowUpReminders } from '@/lib/data/visit';
import prisma from '@/lib/prisma';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { visitId } = body;

    if (!visitId) {
      return NextResponse.json({ success: false, error: 'Visit ID required' }, { status: 400 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const visit = await run(tenantId, async () => {
      const found = await prisma.visit.findUnique({
        where: { id: visitId },
        include: { patient: { select: { firstName: true, lastName: true, email: true, phone: true } } },
      });
      return found;
    });

    if (!visit) {
      return NextResponse.json({ success: false, error: 'Visit not found' }, { status: 404 });
    }

    if (!visit.followUpDate) {
      return NextResponse.json({ success: false, error: 'No follow-up date set for this visit' }, { status: 400 });
    }

    // TODO: Implement actual email/SMS sending

    await run(tenantId, () => markFollowUpReminderSent(visitId));

    return NextResponse.json({
      success: true,
      message: 'Follow-up reminder sent successfully',
    });
  } catch (error: any) {
    console.error('Error sending reminder:', error);
    return NextResponse.json({ success: false, error: 'Failed to send reminder' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const daysAhead = parseInt(searchParams.get('daysAhead') || '7');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const visitsNeedingReminders = await run(tenantId, () => findVisitsNeedingFollowUpReminders(today, futureDate));

    return NextResponse.json({
      success: true,
      data: visitsNeedingReminders,
      count: visitsNeedingReminders.length,
    });
  } catch (error: any) {
    console.error('Error fetching reminders:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch reminders' }, { status: 500 });
  }
}
