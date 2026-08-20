import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getLabResultById, findLabResultRawById, updateLabResult, flattenLabResultInput } from '@/lib/data/lab-result';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'lab-results', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const { id } = await params;
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const labResult = await run(tenantId, () => getLabResultById(id));

    if (!labResult) {
      return NextResponse.json({ success: false, error: 'Lab result not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: labResult });
  } catch (error: any) {
    console.error('Error fetching lab result:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch lab result' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'lab-results', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const { id } = await params;
    const body = await request.json();

    if (body.results && !body.resultDate) {
      body.resultDate = new Date();
    }
    if (body.status === 'completed' && !body.resultDate) {
      body.resultDate = new Date();
    }
    if (body.status === 'reviewed') {
      body.reviewedBy = session.userId;
      body.reviewedAt = new Date();
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { labResult, statusChangedToCompleted } = await run(tenantId, async () => {
      const old = await findLabResultRawById(id);
      if (!old) return { labResult: null, statusChangedToCompleted: false };

      const flat = flattenLabResultInput(body);
      const updated = await updateLabResult(id, {
        ...flat,
        reviewedBy: body.reviewedBy ? { connect: { id: body.reviewedBy } } : undefined,
      } as any);

      return { labResult: updated, statusChangedToCompleted: old.status !== 'completed' && body.status === 'completed' };
    });

    if (!labResult) {
      return NextResponse.json({ success: false, error: 'Lab result not found' }, { status: 404 });
    }

    // Check if status changed to 'completed' - trigger automatic notification
    if (statusChangedToCompleted && !labResult.notificationSent) {
      import('@/lib/automations/lab-notifications').then(({ sendLabResultNotification }) => {
        sendLabResultNotification({
          labResultId: labResult.id,
          tenantId: tenantId ?? undefined,
          sendSMS: true,
          sendEmail: true,
          sendNotification: true,
        }).catch((error: any) => {
          console.error('Error sending automatic lab result notification:', error);
        });
      }).catch((error) => {
        console.error('Error loading lab notifications module:', error);
      });
    }

    return NextResponse.json({ success: true, data: labResult });
  } catch (error: any) {
    console.error('Error updating lab result:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update lab result' },
      { status: 500 }
    );
  }
}
