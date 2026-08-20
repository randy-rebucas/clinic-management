import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { findPrescriptionRawById, recordPharmacyDispense } from '@/lib/data/prescription';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

// NOTE: this route only records the pharmacy dispense event + status
// transition on Prescription. Any Inventory/Medicine stock decrement tied
// to dispensing (if it exists elsewhere) is out of scope for this batch —
// InventoryItem has no lib/data module yet and is owned by the later
// "supporting models" batch. The original Mongoose route did not touch
// Inventory either, so no behavior is lost here.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { id } = await params;
    const body = await request.json();

    const prescription = await run(tenantId, async () => {
      const existing = await findPrescriptionRawById(id);
      if (!existing) return null;

      return recordPharmacyDispense(id, {
        pharmacyId: body.pharmacyId,
        pharmacyName: body.pharmacyName,
        dispensedBy: body.dispensedBy || 'Pharmacy Staff',
        quantityDispensed: body.quantityDispensed,
        notes: body.notes,
        trackingNumber: body.trackingNumber,
      });
    });

    if (!prescription) {
      return NextResponse.json({ success: false, error: 'Prescription not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: prescription });
  } catch (error: any) {
    console.error('Error recording dispense:', error);
    return NextResponse.json({ success: false, error: 'Failed to record dispense' }, { status: 500 });
  }
}
