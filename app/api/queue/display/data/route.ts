import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { canViewQueueDisplay, loadQueueDisplay } from '@/lib/queue-display';

/**
 * What the waiting-room screen (/queue/display) refreshes from. Clinic subdomain only, under the
 * same rule as the screen itself; numbers and initials only.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Clinic not found' }, { status: 404 });
    }
    if (!(await canViewQueueDisplay(tenantId))) {
      return NextResponse.json({ success: false, error: 'Queue display is not enabled' }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const data = await loadQueueDisplay(tenantId, {
      doctorId: searchParams.get('doctorId'),
      roomId: searchParams.get('roomId'),
    });
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  } catch (error) {
    console.error('Error loading queue display:', error);
    return NextResponse.json({ success: false, error: 'Failed to load queue display' }, { status: 500 });
  }
}
