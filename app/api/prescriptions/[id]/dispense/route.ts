import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import InventoryItem from '@/models/Inventory';
import { recordMovement } from '@/lib/inventory-movements';
import { getPermissionChecker, requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, escapeRegex } from '@/lib/api/validate';
import { distribute, dispensedPerMedication, type DispenseItem } from '@/lib/prescription-dispense';

const dispenseSchema = z.object({
  pharmacyId: z.string().trim().max(100).optional(),
  pharmacyName: z.string().trim().max(200).optional(),
  dispensedBy: z.string().trim().max(200).optional(),
  // Legacy: one total, applied to the medications in order.
  quantityDispensed: z.coerce.number().int().min(0).max(100000).optional(),
  // Preferred: explicit per-medication quantities.
  items: z.array(z.object({
    medicationIndex: z.number().int().min(0).max(200),
    quantity: z.number().int().min(1).max(100000),
  })).max(200).optional(),
  notes: z.string().max(2000).optional(),
  trackingNumber: z.string().trim().max(200).optional(),
});

type Item = DispenseItem;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  // Whoever may change prescriptions may dispense them; the front desk may only dispense.
  if (!(await getPermissionChecker(session))('prescriptions', 'update')) {
    const permissionCheck = await requirePermission(session, 'prescriptions', 'dispense');
    if (permissionCheck) return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Prescription');

    const parsed = await parseBody(request, dispenseSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    const prescription = await Prescription.findOne(tenantFilter(tenantId, { _id: id }));
    if (!prescription) return notFound('Prescription');

    if (prescription.status === 'cancelled') {
      return NextResponse.json({ success: false, error: 'Cancelled prescriptions cannot be dispensed' }, { status: 409 });
    }
    if (prescription.status === 'dispensed' || prescription.status === 'completed') {
      return NextResponse.json({ success: false, error: 'This prescription has already been fully dispensed' }, { status: 409 });
    }

    const medications: any[] = prescription.medications || [];
    const prescribed = medications.map((m) => Math.max(0, Number(m.quantity) || 0));
    const already = dispensedPerMedication(prescribed, prescription.pharmacyDispenses || []);

    let items: Item[];
    if (body.items && body.items.length) {
      // Lines for the same medication are added together before the check, so repeating a line
      // can't dispense more than was prescribed.
      const perMedication = new Map<number, number>();
      for (const it of body.items) {
        if (it.medicationIndex >= medications.length) {
          return NextResponse.json({ success: false, error: 'Invalid medication index' }, { status: 400 });
        }
        perMedication.set(it.medicationIndex, (perMedication.get(it.medicationIndex) ?? 0) + it.quantity);
      }
      items = [];
      for (const [medicationIndex, quantity] of perMedication) {
        const remaining = prescribed[medicationIndex] - already[medicationIndex];
        if (prescribed[medicationIndex] > 0 && quantity > remaining) {
          return NextResponse.json(
            { success: false, error: `Quantity for ${medications[medicationIndex].name} exceeds the remaining ${Math.max(0, remaining)}` },
            { status: 400 }
          );
        }
        items.push({ medicationIndex, quantity });
      }
    } else {
      const total = body.quantityDispensed || 0;
      const remainingTotal = prescribed.reduce((s, q, i) => s + Math.max(0, q - already[i]), 0);
      if (total > remainingTotal && remainingTotal > 0) {
        return NextResponse.json(
          { success: false, error: `Quantity exceeds the remaining ${remainingTotal}` },
          { status: 400 }
        );
      }
      items = distribute(total, prescribed, already);
      // Medications without a prescribed quantity: a single-medication prescription takes the whole amount.
      if (items.length === 0 && total > 0 && medications.length === 1) {
        items = [{ medicationIndex: 0, quantity: total }];
      }
    }

    const quantityDispensed = items.reduce((s, it) => s + it.quantity, 0);
    if (quantityDispensed <= 0) {
      return NextResponse.json({ success: false, error: 'Enter a quantity to dispense' }, { status: 400 });
    }

    // Deduct stock first; a shortage of a stocked item blocks the dispense.
    const warnings: string[] = [];
    const deducted: Array<{ itemId: Types.ObjectId; quantity: number; after: number }> = [];
    const restoreStock = async () => {
      for (const d of deducted) {
        await InventoryItem.updateOne({ _id: d.itemId, tenantId: tenantObjectId }, { $inc: { quantity: d.quantity } });
      }
    };
    for (const it of items) {
      const med = medications[it.medicationIndex];
      // A stock item linked to the medicine, or else one not linked to any medicine with the same name.
      const byName = { name: new RegExp(`^${escapeRegex(String(med.name || '').trim())}$`, 'i') };
      const match: Record<string, unknown> = med.medicineId
        ? { $or: [{ medicineId: med.medicineId }, { medicineId: null, ...byName }] }
        : byName;
      const stockItem = await InventoryItem.findOne(tenantFilter(tenantObjectId, { category: 'medicine', ...match }))
        .sort({ medicineId: -1 }) // the linked item first
        .select('_id quantity')
        .lean() as any;
      if (!stockItem) {
        warnings.push(`No inventory item matches ${med.name}; stock was not deducted.`);
        continue;
      }
      const updated = await InventoryItem.findOneAndUpdate(
        { _id: stockItem._id, tenantId: tenantObjectId, quantity: { $gte: it.quantity } },
        { $inc: { quantity: -it.quantity } },
        { new: true }
      );
      if (!updated) {
        await restoreStock();
        return NextResponse.json(
          { success: false, error: `Insufficient stock for ${med.name} (available: ${stockItem.quantity ?? 0})` },
          { status: 409 }
        );
      }
      deducted.push({ itemId: stockItem._id, quantity: it.quantity, after: updated.quantity });
    }

    const dispenses = prescription.pharmacyDispenses || [];
    const after = already.slice();
    for (const it of items) after[it.medicationIndex] += it.quantity;
    const tracked = prescribed.map((q, i) => ({ q, d: after[i] })).filter((x) => x.q > 0);
    const fullyDispensed = tracked.length > 0
      ? tracked.every((x) => x.d >= x.q)
      : after.every((d) => d > 0);

    // Recorded only if no other dispense landed since this one read the prescription; otherwise
    // the remaining quantities checked above are stale, and the stock goes back.
    let saved;
    try {
      saved = await Prescription.findOneAndUpdate(
        {
          _id: prescription._id,
          tenantId: tenantObjectId,
          status: { $nin: ['cancelled', 'dispensed', 'completed'] },
          [`pharmacyDispenses.${dispenses.length}`]: { $exists: false },
        },
        {
          $push: {
            pharmacyDispenses: {
              pharmacyId: body.pharmacyId,
              pharmacyName: body.pharmacyName,
              dispensedAt: new Date(),
              dispensedBy: body.dispensedBy || session.name || session.email || 'Pharmacy Staff',
              quantityDispensed,
              items,
              notes: body.notes,
              trackingNumber: body.trackingNumber,
            },
          },
          $set: { status: fullyDispensed ? 'dispensed' : 'partially-dispensed' },
        },
        { new: true, runValidators: true }
      );
    } catch (error) {
      await restoreStock();
      throw error;
    }
    if (!saved) {
      await restoreStock();
      return NextResponse.json(
        { success: false, error: 'This prescription was dispensed by someone else just now. Reload it and try again.' },
        { status: 409 }
      );
    }

    // Every deduction held, so the stock ledger can record them against this prescription.
    for (const d of deducted) {
      await recordMovement({
        tenantId: tenantObjectId,
        item: d.itemId,
        type: 'dispense',
        change: -d.quantity,
        quantityAfter: d.after,
        prescription: saved._id,
        prescriptionCode: saved.prescriptionCode,
        performedBy: session.userId,
      });
    }

    await saved.populate({ path: 'patient', select: 'firstName lastName patientCode', match: { tenantIds: tenantObjectId } });
    await saved.populate({ path: 'prescribedBy', select: 'name email', match: { tenantId: tenantObjectId } });

    return NextResponse.json({ success: true, data: saved, warnings });
  } catch (error: any) {
    console.error('Error recording dispense:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to record dispense' },
      { status: 500 }
    );
  }
}
